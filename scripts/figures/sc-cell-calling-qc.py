import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')


def gammap(a, x):
    """Regularized lower incomplete gamma P(a, x) — series below a+1, continued fraction above."""
    if x <= 0:
        return 0.0
    if x < a + 1:
        term = 1.0 / a
        total = term
        n = a
        for _ in range(500):
            n += 1
            term *= x / n
            total += term
            if abs(term) < abs(total) * 1e-15:
                break
        return total * math.exp(-x + a * math.log(x) - math.lgamma(a))
    # Lentz's continued fraction for Q(a, x)
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return 1.0 - math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


# ── 1 · The knee plot, derived rather than simulated ─────────────────────────
# 100,000 barcodes: 4,000 large cells ~ Gamma(4, 1250), 6,000 small cells ~ Gamma(4, 100),
# and 90,000 empties ~ Gamma(2, 30). The depth at rank r is the (1 - r/N) quantile of that
# mixture, so the curve is exact. The small cells make the second shoulder, and it is the
# whole reason a single threshold cannot work.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
N = 100000
POPS = ((0.040, 4, 1250.0), (0.060, 4, 100.0), (0.900, 2, 30.0))
mixcdf = lambda x: sum(w * gammap(k, x / s) for w, k, s in POPS)


def depth_at_rank(r):
    target = 1.0 - r / N
    lo, hi = 1e-6, 300000.0
    for _ in range(90):
        m = (lo + hi) / 2
        if mixcdf(m) < target:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


ax = Axes(112.0, 424.0, 44.0, 232.0, (1.0, 100000.0), (10.0, 30000.0), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([10, 100, 1000, 10000], ['10', '100', '1,000', '10,000'], size=10))
o.append(ax.xticks([1, 10, 100, 1000, 10000, 100000],
                   ['1', '10', '100', '1,000', '10k', '100k']))
o.append(ax.curve(lambda r: max(10.0, min(30000.0, depth_at_rank(r))), n=150, width=2.3,
                  stroke=ACCENT))

# the threshold everyone reaches for, and what it lands on
o.append(line(ax.x0, ax.py(500.0), ax.x1, ax.py(500.0), 1.4, opacity='.5', dash='5 4'))
o.append(text(ax.x0 + 6, ax.py(500.0) - 8, 'a 500-UMI cutoff', 10, opacity='.75'))

# each plateau is named in the empty band above it, never on the curve itself
o.append(text(ax.px(60.0), ax.py(17000.0), 'large cells', 10.5, anchor='middle',
              fill=ACCENT, weight='600'))
o.append(text(ax.px(6000.0), ax.py(2600.0), 'small cells', 10.5, anchor='middle',
              opacity='.8'))
o.append(text(ax.px(35000.0), ax.py(230.0), 'empty droplets', 10.5, anchor='middle',
              opacity='.8'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(10.0) + 40, 'Barcode rank', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Total UMIs', 11, opacity='.8'))

LX = ax.x1 + 26
o.append(text(LX, 62, 'There is no clean cut.', 11, weight='700'))
for i, t in enumerate(['Two size classes do not give', 'two flat steps - they give one',
                       'long descent, and the small', 'cells overlap the empties in',
                       'depth however the curve is', 'read.', '',
                       'A cutoff at 500 lands inside', 'the small-cell range and',
                       'recovers 26.5% of them. Move', 'it down to keep them and the',
                       'empties come too.', '',
                       'This is the problem the', 'ambient profile solves: test',
                       'each barcode against the', 'soup, not against a number.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-knee-plot.svg'), svg(760, 306, ''.join(o)))

# ── 2 · A mitochondrial cutoff is a cell-type filter ─────────────────────────
# Mitochondrial share is a property of the cell type, not only of its health, so one
# threshold retains cell types at wildly different rates. Bars start at zero.
def ncdf(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))

TYPES = (('Cardiomyocytes', 0.30), ('Hepatocytes', 0.22),
         ('Fibroblasts', 0.06), ('Lymphocytes', 0.04))
SD = 0.05
keep = lambda m: 100 * ncdf((0.10 - m) / SD)

ax = Axes(196.0, 392.0, 44.0, 216.0, (0.0, 100.0), (0.0, 4.0))
o = [line(ax.x0, ax.py(0.0), ax.x0, ax.py(4.0), 1.25)]
for v in (0, 25, 50, 75, 100):
    o.append(line(ax.px(v), ax.py(0.0), ax.px(v), ax.py(4.0), 1, '.12'))
    o.append(text(ax.px(v), ax.py(0.0) + 18, '%d%%' % v, 11, anchor='middle', opacity='.75'))
for i, (name, m) in enumerate(TYPES):
    yy = ax.py(3.5 - i * 0.9)
    v = keep(m)
    # bars start at zero; the mito median rides the row label so it is legible whatever
    # the bar length, and nothing is ever drawn in the page background colour
    o.append(rect(ax.x0, yy - 11, max(0.6, ax.px(v) - ax.x0), 22, opacity='.85', fill=ACCENT))
    o.append(text(ax.x0 - 8, yy + 1, name, 10.5, anchor='end'))
    o.append(text(ax.x0 - 8, yy + 13, '%d%% mito' % round(100 * m), 9.5, anchor='end',
                  opacity='.65'))
    o.append(text(ax.px(v) + 8, yy + 4, '%.1f%% kept' % (round(v * 10) / 10), 10.5,
                  fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'Cells surviving a 10% mitochondrial cutoff', 12, anchor='middle'))

LX = 478.0
o.append(text(LX, 62, 'It deletes a cell type.', 11, weight='700'))
for i, t in enumerate(['Mitochondrial share tracks', 'energy demand, so it is a',
                       'property of the cell type as', 'much as of its health.', '',
                       'One threshold across the', 'whole dataset removes every',
                       'cardiomyocyte and keeps', 'most lymphocytes - and the',
                       'atlas then reports a heart', 'with no muscle in it.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-mito-filter.svg'), svg(760, 292, ''.join(o)))
print('wrote sc-knee-plot.svg, sc-mito-filter.svg')
