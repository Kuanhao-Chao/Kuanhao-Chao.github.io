import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── 1 · How far a marker leaks into cells that never expressed it ────────────
# The soup carries every cell type's transcripts in proportion to how much of the tissue
# they were. A gene that is 2% of type A's profile, with A at 20% of the cells, is 0.40% of
# the soup -- so a cell of another type with depth d and ambient fraction a picks up
# d*a*0.004 counts of it, and shows it at all with probability 1 - exp(-that).
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
SOUP = 0.20 * 0.02
det = lambda a, d: 100 * (1 - math.exp(-d * a * SOUP))

ax = Axes(104.0, 424.0, 44.0, 232.0, (0.0, 0.25), (0.0, 100.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([0, 0.05, 0.10, 0.15, 0.20, 0.25],
                   ['0%', '5%', '10%', '15%', '20%', '25%']))
for d, col, op in ((20000, 'currentColor', '.45'), (5000, ACCENT, None),
                   (1000, 'currentColor', '.7')):
    o.append(ax.curve(lambda a, d=d: det(a, d), n=240, width=2.1, stroke=col, opacity=op))

o.append(line(ax.px(0.10), ax.py(0.0), ax.px(0.10), ax.py(det(0.10, 5000)), 1.1,
              opacity='.3', dash='3 3'))
o.append(circle(ax.px(0.10), ax.py(det(0.10, 5000)), 4.2, fill=ACCENT))
o.append(text(ax.px(0.10) + 10, ax.py(det(0.10, 5000)) + 16, '86.5% at 10% ambient', 10.5,
              fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Ambient fraction of a cell’s counts',
              12, anchor='middle'))
o.append(text(ax.x0 - 82, 26, 'Wrong-type cells showing the marker', 11, opacity='.8'))

LX = ax.x1 + 30
for i, (lab, col, op) in enumerate((('20,000 UMIs', 'currentColor', '.45'),
                                    ('5,000 UMIs', ACCENT, None),
                                    ('1,000 UMIs', 'currentColor', '.7'))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 128, 'Depth makes it worse.', 11, weight='700'))
for i, t in enumerate(['The soup contributes a fixed', 'fraction of every cell’s counts,',
                       'so a deeply sequenced cell', 'picks up proportionally more',
                       'of it - and crosses the', 'detection threshold sooner.', '',
                       'A marker is not evidence of', 'a cell type until the ambient',
                       'rate has been subtracted.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-ambient-leak.svg'), svg(736, 306, ''.join(o)))

# ── 2 · Depth cannot separate doublets, and the arithmetic is exact ──────────
# Take singlet depth as Gamma(k, s). A doublet is the sum of two independent cells, which is
# exactly Gamma(2k, s) -- no approximation. The two densities overlap so heavily that a
# threshold keeping 95% of singlets catches under half the doublets.
K, S = 4, 1250.0
def gpdf(x, k):
    return x ** (k - 1) * math.exp(-x / S) / (S ** k * math.gamma(k))

THRESH = 9692.0        # the 95th percentile of the singlet distribution
top = max(gpdf(x, K) for x in range(200, 25000, 50))

o = []
ax = Axes(104.0, 424.0, 44.0, 232.0, (0.0, 25000.0), (0.0, top * 1.08))
o.append(ax.frame())
o.append(ax.xticks([0, 5000, 10000, 15000, 20000, 25000],
                   ['0', '5k', '10k', '15k', '20k', '25k']))
o.append(line(ax.x0, ax.py(0.0), ax.x1, ax.py(0.0), 1, opacity='.12'))
o.append(ax.curve(lambda x: gpdf(max(x, 1.0), K), n=300, width=2.3, stroke=ACCENT))
o.append(ax.curve(lambda x: gpdf(max(x, 1.0), 2 * K), n=300, width=2.1,
                  stroke='currentColor', opacity='.7'))

o.append(line(ax.px(THRESH), ax.py(0.0), ax.px(THRESH), ax.py(top * 1.02), 1.4,
              opacity='.5', dash='5 4'))
o.append(text(ax.px(THRESH) + 8, ax.py(top * 0.98), 'keeps 95% of singlets', 10,
              opacity='.75'))
o.append(text(ax.px(THRESH) + 8, ax.py(top * 0.98) + 13, 'catches 48.8% of doublets', 10,
              opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Total UMIs in the barcode', 12,
              anchor='middle'))
o.append(text(ax.x0 - 82, 26, 'Density', 11, opacity='.8'))

# Both densities are named in the margin: the curves cross, so an inline label for one
# lands on the other at some point of the domain.
LX = ax.x1 + 26
for i, (lab, col, op) in enumerate((('singlets', ACCENT, None),
                                    ('doublets', 'currentColor', '.7'))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 110, 'The modes are 2x apart.', 11, weight='700'))
for i, t in enumerate(['The distributions are not.', 'A doublet is the sum of two',
                       'cells, so its depth is Gamma', 'with twice the shape - wider',
                       'in absolute terms, and badly', 'overlapped with the singlets.',
                       '', 'Catching 90% of doublets on', 'depth alone would discard',
                       '31.7% of good cells. This is', 'why doublet callers simulate',
                       'expression instead.']):
    o.append(text(LX, 128 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-doublet-depth.svg'), svg(740, 306, ''.join(o)))
print('wrote sc-ambient-leak.svg, sc-doublet-depth.svg')
