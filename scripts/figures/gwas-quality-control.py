import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: where the relatedness cut falls ────────────────────────────────
# PI_HAT is not a continuous score to threshold; it is a set of expected values with gaps
# between them, and 0.185 sits in the lowest gap a study still wants to break across — the
# one between second-degree relatives and first cousins. It is not the widest gap; the ones
# above it are, and every pair on that side is one the study means to remove anyway.
# Labels alternate rows because five
# classes bunched at the low end collide on one. Every value is asserted in the test file.
CLASSES = [(0.0, 'unrelated', 0), (0.125, 'first cousin', 1), (0.25, '2nd degree', 0),
           (0.5, '1st degree', 1), (1.0, 'duplicate / MZ', 0)]
CUT = 0.185

ax = Axes(110.0, 470.0, 66.0, 150.0, (-0.05, 1.07), (0.0, 1.0))
o = [line(ax.x0, ax.y1, ax.x1, ax.y1, 1.25)]
o.append(ax.xticks([0.0, 0.125, 0.25, 0.5, 1.0], ['0', '1/8', '1/4', '1/2', '1']))
o.append(rect(ax.px(0.125), 78.0, ax.px(0.25) - ax.px(0.125), 72.0, opacity='0.09',
              fill='currentColor', rx=2))
o.append(line(ax.px(CUT), 66.0, ax.px(CUT), 150.0, 1.6, opacity='.65', dash='5 4'))
o.append(text(ax.px(CUT), 58.0, 'cut at 0.185', 10.5, anchor='middle', weight='600'))
# `first cousin` centred on 1/8 runs under the dashed cut, so the raised row is nudged
# left and a leader line keeps it tied to its marker.
NUDGE = {0.125: -0.028}
for v, lab, row in CLASSES:
    o.append(circle(ax.px(v), 124.0, 5.5, fill=ACCENT))
    lx = ax.px(v + NUDGE.get(v, 0.0))
    o.append(text(lx, 100.0 - 14 * row, lab, 9.5, anchor='middle', opacity='.85'))
    if row:
        o.append(line(ax.px(v), 92.0, ax.px(v), 116.0, 1, opacity='.25'))
o.append(text((ax.x0 + ax.x1) / 2, ax.y1 + 40, 'Proportion of the genome shared IBD', 12,
              anchor='middle'))
# The note that used to sit at y1+18 landed exactly on the tick labels; it says the same
# thing as the shaded band, so it is folded into the headline instead.
o.append(text(20, 24, 'PI_HAT is a set of expected values with gaps — and the cut sits in one',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'gwas-quality-control-pihat.svg'),
                           svg(640, 208, ''.join(o))))

# ── Figure 2: what breaking 400 pairs costs, per arm ─────────────────────────
# Plotted as the LOSS from zero, not as the surviving effective size from a truncated
# baseline. The first version drew bars from 30,800, so their lengths were 216.8 px and
# 32.0 px — a 6.8:1 picture of a 1.03:1 difference, in the one channel a bar is read by.
# The loss is also the quantity the figure is about, and it is the one that differs 16-fold.
neff = lambda c, k: 4 / (1 / c + 1 / k)
BASE = neff(10000, 40000)
BARS = [('drop 400 controls', BASE - neff(10000, 39600)),
        ('drop 400 cases', BASE - neff(9600, 40000))]

bx = Axes(200.0, 452.0, 60.0, 132.0, (0.0, 1150.0), (-0.7, 1.7))
p = [bx.frame()]
p.append(bx.xticks([0, 250, 500, 750, 1000], ['0', '250', '500', '750', '1,000']))
for k, (lab, v) in enumerate(BARS):
    y = bx.py(1 - k)
    p.append(rect(bx.px(0.0), y - 10, bx.px(v) - bx.px(0.0), 20, fill=ACCENT,
                  opacity='0.85' if k else '0.4', rx=2))
    p.append(text(bx.x0 - 12, y + 4, lab, 10, anchor='end'))
    p.append(text(bx.px(v) + 8, y + 4, '%.2f' % v, 9.5, weight='600', fill=ACCENT))
p.append(text((bx.x0 + bx.x1) / 2, bx.y1 + 42, 'Effective samples lost', 12, anchor='middle'))
p.append(text(20, 24, 'The same 400 people, removed from one arm or the other', 11.5,
              opacity='.8'))
p.append(text(20, 198, 'Dropping the case costs 1,032.26 effective samples; dropping the control',
              10, opacity='.85'))
p.append(text(20, 212, 'costs 64.52 — sixteen times, the same ratio as the design lesson.', 10,
              opacity='.85'))
print('fig2 bytes:', write(os.path.join(OUT, 'gwas-quality-control-pruning.svg'),
                           svg(640, 226, ''.join(p))))
print('  losses %.4f vs %.4f  ratio %.4f'
      % (BASE - neff(10000, 39600), BASE - neff(9600, 40000),
         (BASE - neff(9600, 40000)) / (BASE - neff(10000, 39600))))
