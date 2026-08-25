import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── The track's thesis in one plot ───────────────────────────────────────────
# Cells within a donor are correlated, so treating them as replicates inflates every test
# statistic by sqrt(1 + (m-1)rho). The nominal-5% false-positive rate therefore climbs
# towards 1 as cells per sample grow -- a test that gets worse with more data. Averaging
# to one value per sample first (pseudobulk) is flat at 5% by construction.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
RHO = 0.05
Z = 1.959963984540054                     # two-sided 5%

def ncdf(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))

vif = lambda m: 1 + (m - 1) * RHO
fpr = lambda m: 100 * 2 * ncdf(-Z / math.sqrt(vif(m)))

ax = Axes(104.0, 424.0, 44.0, 232.0, (1.0, 10000.0), (0.0, 100.0), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([1, 10, 100, 1000, 10000], ['1', '10', '100', '1,000', '10,000']))

# what the test promises, and never delivers
o.append(line(ax.x0, ax.py(5.0), ax.x1, ax.py(5.0), 1.6, opacity='.55', dash='5 4'))
o.append(text(ax.x1 - 4, ax.py(5.0) - 9, 'pseudobulk: calibrated at 5%', 10,
              anchor='end', opacity='.75'))
o.append(ax.curve(fpr, n=260, width=2.3, stroke=ACCENT))

READINGS = []
for m in (50, 500, 5000):
    y = fpr(m)
    READINGS.append((m, '%.1f%%' % (round(y * 10) / 10)))
    o.append(circle(ax.px(m), ax.py(y), 4.2, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Cells per sample', 12, anchor='middle'))
o.append(text(ax.x0 - 82, 26, 'Null genes called significant', 11, opacity='.8'))

LX = ax.x1 + 22
o.append(text(LX, 60, 'More cells, worse test.', 11, weight='700'))
for i, (m, lab) in enumerate(READINGS):
    o.append(text(LX, 80 + 16 * i, '{:,} cells'.format(m), 10, opacity='.8'))
    o.append(text(LX + 100, 80 + 16 * i, lab, 10, anchor='end', fill=ACCENT, weight='600'))
for i, t in enumerate(['At an intra-donor correlation', 'of 0.05, a per-cell test at',
                       'nominal 5% rejects seven in', 'ten true nulls once there are',
                       '500 cells per donor - and the', 'cells, not the biology, are',
                       'what drives the number up.', '',
                       'Averaging each donor to one', 'value first is the only line',
                       'here that is calibrated.']):
    o.append(text(LX, 148 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-pseudoreplication.svg'), svg(760, 320, ''.join(o)))
print('wrote sc-pseudoreplication.svg')
