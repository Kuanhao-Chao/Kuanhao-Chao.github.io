import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, rect, write, Axes, ACCENT

# ClinVar's review status, as counts. Read off the NCBI statistics page on 2026-08-16 and
# asserted in the lesson tests, so the figure and the prose cannot drift apart.
ROWS = [
    ('All variation records',        4_553_176, '.22'),
    ('Carrying a classification',    4_302_878, '.34'),
    ('Reviewed by an expert panel',     22_402, '.62'),
    ('Practice guideline',                 663, '.88'),
]
LO, HI = 100, 10_000_000
X0, X1 = 236.0, 604.0
def px(v): return X0 + (math.log10(v) - math.log10(LO)) / (math.log10(HI) - math.log10(LO)) * (X1 - X0)

o = []
o.append(text(320, 20, 'How much of ClinVar has been reviewed by anyone in particular',
              11.5, anchor='middle', opacity='.8'))

BY, BH, GAP = 44.0, 26.0, 20.0
for i, (label, n, op) in enumerate(ROWS):
    y = BY + i * (BH + GAP)
    o.append(rect(X0, y, px(n) - X0, BH, opacity=op, rx=3))
    o.append(text(X0 - 12, y + 17, label, 11, anchor='end'))
    o.append(text(px(n) + 8, y + 17, '{:,}'.format(n), 11, weight='600'))

# the two drops worth naming
def bracket(i, j, msg):
    y0 = BY + i * (BH + GAP) + BH
    y1 = BY + j * (BH + GAP)
    x = X0 + 26
    o.append(line(x, y0 + 3, x, y1 - 3, 1.25, stroke=ACCENT, opacity='.7'))
    o.append(text(x + 8, (y0 + y1) / 2 + 4, msg, 10.5, fill=ACCENT, weight='600'))

bracket(1, 2, '1 classified variant in 192')
bracket(2, 3, '1 in 6,490')

# axis
AY = BY + len(ROWS) * (BH + GAP) - GAP + 14
o.append(line(X0, AY, X1, AY, 1.25))
for k in range(2, 8):
    o.append(line(px(10 ** k), AY, px(10 ** k), AY + 5, 1))
    o.append(text(px(10 ** k), AY + 18, ['100', '1k', '10k', '100k', '1M', '10M'][k - 2], 11,
                  anchor='middle', opacity='.75'))
o.append(text((X0 + X1) / 2, AY + 38, 'Number of records (log scale)', 12, anchor='middle'))

H = int(AY + 52)
for label, n, _ in ROWS: print('  %-30s %10s' % (label, '{:,}'.format(n)))
print('  1 in %.1f classified reviewed by expert panel' % (4_302_878 / 22_402))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-germline-clinical.svg'),
                      svg(640, H, ''.join(o))))
