import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, rect, text, line, write, ACCENT, BG

W = 640
X0, X1 = 128.0, 612.0
ROW_H, GAP, TOP = 46.0, 8.0, 42.0

# (n, name, establishes, cannot)
LAYERS = [
    ('1', 'Reference',  'what the variant is called',     'whether it matters'),
    ('2', 'Frequency',  'how often it is seen',           'why it is rare'),
    ('3', 'Constraint', 'whether the gene tolerates LoF', 'anything about one variant'),
    ('4', 'Function',   'what the sequence does',         'what it does in a person'),
    ('5', 'Curation',   'what others concluded',          'a first-hand measurement'),
    ('6', 'Benchmarks', 'whether a predictor works',      'the answer itself'),
]

# Two columns rather than two prefixed sentences: the "establishes / cannot establish"
# contrast is the point of the figure, and repeating those words on every row both wastes
# the width and lets the long rows collide.
COL_A, COL_B = 250.0, 430.0

o = []
o.append(text(W / 2, 16, 'Each layer answers a question the others cannot', 11.5,
              anchor='middle', opacity='.8'))
o.append(text(COL_A, 32, 'ESTABLISHES', 9.5, opacity='.6', weight='600'))
o.append(text(COL_B, 32, 'CANNOT ESTABLISH', 9.5, opacity='.45', weight='600'))

for i, (n, name, does, cant) in enumerate(LAYERS):
    y = TOP + i * (ROW_H + GAP)
    # a band, tinted a little more strongly further down the stack
    o.append(rect(X0, y, X1 - X0, ROW_H, opacity=0.05 + 0.02 * i, rx=3,
                  stroke='currentColor'))
    # the numbered tab
    o.append(rect(X0 - 30, y, 26, ROW_H, opacity=None, fill=ACCENT, rx=3))
    o.append(text(X0 - 17, y + ROW_H / 2 + 4, n, 13, anchor='middle',
                  fill='var(--color-on-accent, #fff)', weight='700'))
    o.append(text(X0 + 14, y + ROW_H / 2 + 4, name, 12.5, weight='600'))
    o.append(text(COL_A, y + ROW_H / 2 + 4, does, 10.5, opacity='.75'))
    o.append(text(COL_B, y + ROW_H / 2 + 4, cant, 10.5, opacity='.5'))

# the dependency spine: everything below depends on the layer above for coordinates
spine_x = X0 - 42
bottom = TOP + len(LAYERS) * (ROW_H + GAP) - GAP
o.append(line(spine_x, TOP + 8, spine_x, bottom - 8, 1.5, opacity='.45', dash='5 4'))
for i in range(len(LAYERS) - 1):
    ay = TOP + i * (ROW_H + GAP) + ROW_H + GAP / 2
    o.append('<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f" fill="none" stroke="currentColor" '
             'stroke-width="1.5" opacity=".45" stroke-linecap="round"/>'
             % (spine_x - 4, ay - 4, spine_x, ay, spine_x + 4, ay - 4))
o.append(text(spine_x - 8, (TOP + bottom) / 2, 'depends on the layer above', 10.5,
              anchor='middle', opacity='.6',
              extra='transform="rotate(-90 %.1f %.1f)"' % (spine_x - 8, (TOP + bottom) / 2)))

H = int(bottom + 22)
out = svg(W, H, ''.join(o))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'genomic-data-layers.svg'), out),
      '| height:', H)
