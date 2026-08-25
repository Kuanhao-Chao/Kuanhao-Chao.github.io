import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── 1 · The multiplet rate is a property of the load, not of the kit ─────────
# A droplet run partitions the suspension into D effective partitions and loads cells
# into them at random, so occupancy is Poisson. Recovering R cells means lambda =
# -ln(1 - R/D), and the multiplet rate among *occupied* partitions follows. The field's
# "~0.8% per 1,000 cells" is the tangent at the origin; the exact curve is convex, so
# the rule under-predicts exactly where users push hardest.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
D = 62500                       # effective partitions, inverted from the 0.8%/1,000 rule
PER_1000 = 0.008
mult = lambda lam: (1 - math.exp(-lam) - lam * math.exp(-lam)) / (1 - math.exp(-lam))
rate = lambda R: mult(-math.log(1 - R / D))

ax = Axes(96.0, 424.0, 44.0, 232.0, (0.0, 20000.0), (0.0, 20.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 5, 10, 15, 20], ['0%', '5%', '10%', '15%', '20%']))
o.append(ax.xticks([0, 5000, 10000, 15000, 20000], ['0', '5k', '10k', '15k', '20k']))
# the linear rule, drawn first so the exact curve reads as the correction
o.append(path([(ax.px(0.0), ax.py(0.0)), (ax.px(20000.0), ax.py(100 * PER_1000 * 20))],
              width=1.6, dash='5 4', opacity='.5'))
o.append(ax.curve(lambda R: 100 * rate(R) if R > 0 else 0.0, n=240, width=2.2, stroke=ACCENT))

READINGS = []
for R in (1000, 10000, 20000):
    y = 100 * rate(R)
    READINGS.append((R, '%.2f%%' % (round(y * 100) / 100)))
    o.append(circle(ax.px(R), ax.py(y), 4.2, fill=ACCENT))

# The dashed rule is labelled in the empty wedge below it, not against it.
o.append(text(ax.px(12000.0), ax.py(6.4), 'the 0.8%-per-1,000 rule', 10,
              anchor='middle', opacity='.7'))
o.append(line(ax.px(12000.0), ax.py(7.0), ax.px(12000.0), ax.py(9.1), 1, opacity='.35'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Cells recovered', 12, anchor='middle'))
o.append(text(ax.x0 - 74, 26, 'Multiplet rate', 11, opacity='.8'))

LX = ax.x1 + 22
o.append(text(LX, 60, 'The load sets the rate.', 11, weight='700'))
for i, (R, lab) in enumerate(READINGS):
    o.append(text(LX, 80 + 16 * i, '{:,} cells'.format(R), 10, opacity='.8'))
    o.append(text(LX + 96, 80 + 16 * i, lab, 10, anchor='end', fill=ACCENT, weight='600'))
for i, t in enumerate(['Doublets are not a defect of', 'the chemistry. They are what',
                       'loading more cells into a fixed', 'number of partitions costs.',
                       '', 'The linear rule is the tangent', 'at zero, so it under-predicts',
                       'by two points at 20,000 cells.']):
    o.append(text(LX, 148 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-multiplet-rate.svg'), svg(736, 300, ''.join(o)))

# ── 2 · UMI collision: why the barcode is 10-12 bases and not 8 ──────────
# Tagging m molecules with random k-mers from U = 4^k and counting distinct tags recovers
# U(1 - e^{-m/U}), not m. For m << U the undercount is m/(2U), a power law -- so on log-log
# the three barcode lengths are parallel lines, each two bases dividing the loss by 16.
o = []
ax = Axes(112.0, 424.0, 44.0, 232.0, (100.0, 20000.0), (1e-4, 100.0), xlog=True, ylog=True)
o.append(ax.frame())
o.append(ax.ygrid([1e-4, 1e-3, 1e-2, 1e-1, 1.0, 10.0, 100.0],
                  ['0.0001%', '0.001%', '0.01%', '0.1%', '1%', '10%', '100%'], size=10))
o.append(ax.xticks([100, 1000, 10000], ['100', '1,000', '10,000']))
loss = lambda m, U: 100 * (1 - U * (1 - math.exp(-m / U)) / m)

MARKS = []
for k, op in ((8, None), (10, '.66'), (12, '.46')):
    U = 4.0 ** k
    col = ACCENT if k == 8 else 'currentColor'
    o.append(ax.curve(lambda m, U=U: loss(m, U), n=240, width=2.1, stroke=col, opacity=op))
    o.append(text(ax.x1 + 7, ax.py(loss(20000.0, U)) + 4, '%d bp' % k, 10.5,
                  fill=col, opacity=op, weight='600'))
    v = loss(1000.0, U)
    # two significant figures, rounded in integer space so the printed digits are the
    # digits the test recomputes
    d = 2 if v >= 0.1 else (3 if v >= 0.01 else 4)
    MARKS.append((k, '%.*f%%' % (d, round(v * 10 ** d) / 10 ** d)))
    o.append(circle(ax.px(1000.0), ax.py(v), 4.0, fill=col, opacity=op))
    o.append(text(ax.px(1000.0) - 9, ax.py(v) + 4, MARKS[-1][1], 10.5, anchor='end',
                  fill=col, opacity=op, weight='600'))

o.append(line(ax.px(1000.0), ax.py(1e-4), ax.px(1000.0), ax.py(100.0), 1.1,
              opacity='.28', dash='3 3'))
o.append(text(ax.px(1000.0), ax.py(100.0) - 8, '1,000 molecules', 10, anchor='middle',
              opacity='.7'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(1e-4) + 40,
              'True molecules of one gene in one cell', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Undercount', 11, opacity='.8'))

LX = ax.x1 + 50
o.append(text(LX, 62, 'Why 10-12 bases.', 11, weight='700'))
for i, t in enumerate(['Distinct tags saturate at', 'U = 4 to the k, and for',
                       'm well under U the loss is', 'm/(2U) - a power law, so',
                       'these are parallel lines.', '',
                       'Every two extra bases', 'divide the undercount by',
                       'sixteen. That is the whole', 'argument for 10-12 over 8.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-umi-collision.svg'), svg(760, 300, ''.join(o)))
print('wrote sc-multiplet-rate.svg, sc-umi-collision.svg')
