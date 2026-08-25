import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, rect, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── The same two variants in two populations ─────────────────────────────────
# Identical allele frequencies on both sides — 0.50 at each locus — and completely
# different haplotype structure, so r2 differs 8.16-fold and so does the sample size a
# study needs to see the causal variant through this tag. Every value is asserted in
# src/lib/deepDiveExamples.test.ts.
PANELS = [
    ('population A', [[0.45, 0.05], [0.05, 0.45]], 0.2000, 0.8000, 0.640000, 61877),
    ('population B', [[0.32, 0.18], [0.18, 0.32]], 0.0700, 0.2800, 0.078400, 505115),
]

o = []
for pi, (name, cells, D, Dp, r2, N) in enumerate(PANELS):
    x0 = 60 + pi * 320
    o.append(text(x0, 46, name, 12, weight='700'))
    o.append(text(x0 + 96, 68, 'B', 10, anchor='middle', opacity='.7'))
    o.append(text(x0 + 152, 68, 'b', 10, anchor='middle', opacity='.7'))
    for r, row in enumerate(cells):
        lab = 'A' if r == 0 else 'a'
        o.append(text(x0 + 56, 96 + 44 * r, lab, 10, anchor='middle', opacity='.7'))
        for c, v in enumerate(row):
            cx = x0 + 72 + 56 * c
            cy = 76 + 44 * r
            # A uniform faint tint with a border, not opacity-by-magnitude: a variable
            # fill puts currentColor text on a background whose lightness changes, and in
            # dark mode the low-frequency cells came out light-on-light. The number
            # already carries the magnitude; the fill was decoration.
            o.append(rect(cx, cy, 52, 36, rx=3, fill='currentColor', opacity='0.07',
                          stroke='currentColor', sw=1))
            o.append(text(cx + 26, cy + 23, '%.2f' % v, 11, anchor='middle', weight='600'))
    o.append(text(x0, 190, 'D = %.4f' % D, 10.5, opacity='.85'))
    o.append(text(x0, 207, "D' = %.4f" % Dp, 10.5, opacity='.85'))
    o.append(text(x0, 224, 'r² = %.6f' % r2, 11, weight='700', fill=ACCENT))
    o.append(text(x0, 250, 'N_eff needed: %s' % format(N, ','), 10.5, weight='600'))

o.append(text(20, 24, 'Same two variants, same allele frequencies, different populations',
              11.5, opacity='.8'))
o.append(line(340, 40, 340, 262, 1, opacity='.2'))
o.append(text(20, 286, 'Both loci sit at frequency 0.50 in both populations, so nothing about the',
              10, opacity='.85'))
o.append(text(20, 300, 'variants themselves differs. Only the haplotypes do — and r² falls 8.16-fold,',
              10, opacity='.85'))
o.append(text(20, 314, 'which is exactly the factor by which the required sample size rises.', 10,
              opacity='.85'))
o.append(text(20, 336, "At equal frequencies r² = D'² exactly, which is why the two columns above",
              10, opacity='.7'))
o.append(text(20, 350, 'move together.', 10, opacity='.7'))

print('bytes:', write(os.path.join(OUT, 'gwas-ld-reference-panels-two-populations.svg'),
                      svg(640, 366, ''.join(o))))
print('  r2 ratio %.4f   N ratio %.4f' % (0.640000 / 0.078400, 505115 / 61877))
