import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# Four one-dimensional embeddings of the same six points: two triplets whose true centres sit
# ten apart. Every value here is recomputed from trustworthiness() in
# src/lib/deepDiveExamples.test.ts.
CASES = [
    ('true structure',   150.0, '1.000000', True),
    ('gap stretched 50x', 7500.0, '1.000000', False),
    ('gap crushed 10x',    15.0, '1.000000', False),
    ('gap crushed 50x',     3.0, '0.933333', False),
]

# ── The metric is pinned while the picture changes 500-fold ──────────────────
ax = Axes(196.0, 400.0, 44.0, 208.0, (1.0, 10000.0), (0.0, 4.0), xlog=True)
o = [line(ax.x0, ax.py(0.0), ax.x0, ax.py(4.0), 1.25)]
for v in (1, 10, 100, 1000, 10000):
    o.append(line(ax.px(v), ax.py(0.0), ax.px(v), ax.py(4.0), 1, '.12'))
    o.append(text(ax.px(v), ax.py(0.0) + 18, '{:,}'.format(v), 11, anchor='middle', opacity='.75'))

for i, (name, ratio, trust, is_true) in enumerate(CASES):
    yy = ax.py(3.5 - i * 0.9)
    o.append(circle(ax.px(ratio), yy, 5.0, fill=ACCENT if is_true else 'currentColor',
                    opacity=None if is_true else '.65'))
    o.append(text(ax.x0 - 8, yy + 1, name, 10.5, anchor='end',
                  weight='600' if is_true else None))
    o.append(text(ax.x0 - 8, yy + 13, 'trustworthiness ' + trust, 9.5, anchor='end',
                  opacity='.65'))

# the band across which the metric never moves off 1
o.append(line(ax.px(15.0), ax.py(0.35), ax.px(7500.0), ax.py(0.35), 2.0, opacity='.5'))
for v in (15.0, 7500.0):
    o.append(line(ax.px(v), ax.py(0.22), ax.px(v), ax.py(0.48), 1.4, opacity='.5'))
o.append(text((ax.px(15.0) + ax.px(7500.0)) / 2, ax.py(0.35) + 17,
              'trustworthiness = 1.000000 throughout', 10, anchor='middle', opacity='.8'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'How separated the two clusters look: between-gap over within-spread', 12,
              anchor='middle'))

LX = ax.x1 + 30
o.append(text(LX, 62, 'Pinned at one.', 11, weight='700'))
for i, t in enumerate(['The same six points, embedded', 'four ways. Three of them score',
                       'a perfect 1.000000 while the', 'apparent separation between',
                       'the two clusters moves by a', 'factor of five hundred.', '',
                       'Trustworthiness only compares', 'rank inside a neighbourhood.',
                       'It cannot see a gap being', 'stretched or squashed, which', 'is the one thing readers',
                       'take from these plots.', '',
                       'Move a single point between', 'clusters and it drops to', '0.466667 at once.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-trustworthiness-blind.svg'), svg(772, 306, ''.join(o)))
print('wrote sc-trustworthiness-blind.svg')
