import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

def ncdf(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))

RHO = 0.05
Z = 1.959963984540054
de = lambda m: 1 + (m - 1) * RHO
fpr = lambda m: 100 * 2 * ncdf(-Z / math.sqrt(de(m)))

# Simulated points: 1,000 null datasets per point, four donors per group, seeded LCG through
# Box-Muller, recomputed in src/lib/deepDiveExamples.test.ts.
MS =     [10, 25, 50, 100, 200, 400]
OBS =    [13.2, 20.2, 29.5, 44.3, 56.6, 65.0]
OBSPB =  [4.8, 5.1, 6.0, 4.0, 3.9, 4.7]

# ── 1 · The theory, and a simulation that agrees with it ─────────────────────
ax = Axes(112.0, 412.0, 44.0, 232.0, (8.0, 500.0), (0.0, 80.0), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 20, 40, 60, 80], ['0%', '20%', '40%', '60%', '80%']))
o.append(ax.xticks([10, 30, 100, 300], ['10', '30', '100', '300']))

o.append(line(ax.x0, ax.py(5.0), ax.x1, ax.py(5.0), 1.8, opacity='.55', dash='6 4'))
# only 12px separate the 5% line from the axis, so the label goes above it at the right end
o.append(text(ax.x1 - 4, ax.py(5.0) - 10, 'what the p-value promises: 5%', 10,
              anchor='end', opacity='.75'))

o.append(ax.curve(fpr, n=220, width=2.4, stroke=ACCENT))
for m, v in zip(MS, OBS):
    o.append(circle(ax.px(m), ax.py(v), 4.4, fill=None, stroke=ACCENT, sw=2.0))
for m, v in zip(MS, OBSPB):
    o.append(circle(ax.px(m), ax.py(v), 4.0, fill='currentColor', opacity='.7'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Cells per sample', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'True nulls called significant', 11, opacity='.8'))

LX = ax.x1 + 26
for i, (lab, col, op, fill) in enumerate((('theory', ACCENT, None, True),
                                          ('per-cell, simulated', ACCENT, None, False),
                                          ('pseudobulk, simulated', 'currentColor', '.7', True))):
    yy = 58 + 17 * i
    if fill and lab == 'theory':
        o.append(line(LX, yy - 4, LX + 20, yy - 4, 2.4, stroke=col))
    else:
        o.append(circle(LX + 10, yy - 4, 4.2, fill=(col if fill else None),
                        stroke=(None if fill else col), sw=2.0, opacity=op))
    o.append(text(LX + 28, yy, lab, 10, fill=col, opacity=op))

o.append(text(LX, 128, 'The curve is real.', 11, weight='700'))
for i, t in enumerate(['One thousand null datasets', 'per point, four donors per',
                       'group. Theory and simulation', 'agree to within 2.8 points',
                       'across the whole range.', '',
                       'The per-cell test rejects', '29.5% of true nulls at fifty',
                       'cells per sample and 56.6% at', 'two hundred. Pseudobulk',
                       'averages 4.75% and does not', 'move.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-de-simulation.svg'), svg(772, 336, ''.join(o)))

# ── 2 · The price, in both directions ────────────────────────────────────────
# Bars from zero: how wrong each quantity is, as a percentage.
ROWS = [('doing it right:\nthe interval widens', 24.84, True),
        ('doing it wrong:\nthe standard error shrinks', 230.9, False)]
ax = Axes(224.0, 424.0, 44.0, 150.0, (0.0, 250.0), (0.0, 2.0))
o = [line(ax.x0, ax.py(0.0), ax.x0, ax.py(2.0), 1.25)]
for v in (0, 50, 100, 150, 200, 250):
    o.append(line(ax.px(v), ax.py(0.0), ax.px(v), ax.py(2.0), 1, '.12'))
    o.append(text(ax.px(v), ax.py(0.0) + 18, '%d%%' % v, 11, anchor='middle', opacity='.75'))
for i, (name, val, good) in enumerate(ROWS):
    yy = ax.py(1.5 - i * 0.9)
    o.append(rect(ax.x0, yy - 12, ax.px(val) - ax.x0, 24, opacity='.85' if good else '.4',
                  fill=ACCENT if good else 'currentColor'))
    a, b = name.split('\n')
    o.append(text(ax.x0 - 8, yy - 2, a, 10.5, anchor='end'))
    o.append(text(ax.x0 - 8, yy + 11, b, 10.5, anchor='end', opacity='.7'))
    o.append(text(ax.px(val) + 8, yy + 4, '%.2f%%' % val if good else '%.1f%%' % val, 10.5,
                  fill=ACCENT if good else 'currentColor', weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'How wrong the number is', 12,
              anchor='middle'))

LX = ax.x1 + 66
o.append(text(LX, 56, 'Twenty-five against', 11, weight='700'))
o.append(text(LX, 70, 'two hundred and thirty.', 11, weight='700'))
for i, t in enumerate(['Aggregating to one value per', 'donor loses no information',
                       'about the effect - the point', 'estimate is identical to',
                       'machine precision. The whole', 'cost is degrees of freedom:',
                       'six instead of sixteen hundred,', 'so the interval widens by a',
                       'quarter.', '',
                       'Not aggregating leaves the', 'standard error three and a',
                       'third times too small.']):
    o.append(text(LX, 92 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-de-price.svg'), svg(772, 268, ''.join(o)))
print('wrote sc-de-simulation.svg, sc-de-price.svg')
