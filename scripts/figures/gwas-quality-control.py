import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: where the relatedness cut falls ────────────────────────────────
# PI_HAT is not a continuous score to threshold; it is a set of expected values with gaps
# between them, and 0.185 is placed in the widest gap. Labels alternate rows because five
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
neff = lambda c, k: 4 / (1 / c + 1 / k)
BASE = neff(10000, 40000)
BARS = [('drop 400 controls', neff(10000, 39600)), ('drop 400 cases', neff(9600, 40000))]

bx = Axes(200.0, 452.0, 60.0, 132.0, (30800.0, 32120.0), (-0.7, 1.7))
p = [bx.frame()]
p.append(bx.xticks([31000, 31500, 32000], ['31,000', '31,500', '32,000']))
p.append(line(bx.px(BASE), bx.py(-0.7), bx.px(BASE), bx.py(1.7), 1.2, opacity='.45', dash='4 3'))
p.append(text(bx.px(BASE) - 6, bx.py(1.7) - 6, 'before pruning', 9.5, anchor='end', opacity='.7'))
for k, (lab, v) in enumerate(BARS):
    y = bx.py(1 - k)
    p.append(rect(bx.px(30800.0), y - 10, bx.px(v) - bx.px(30800.0), 20, fill=ACCENT,
                  opacity='0.85' if k else '0.4', rx=2))
    p.append(text(bx.x0 - 12, y + 4, lab, 10, anchor='end'))
    # inside the bar, so it cannot collide with the "before pruning" rule
    p.append(text(bx.px(v) - 8, y + 4, '%.0f' % v, 9.5, anchor='end', weight='700',
                  fill='var(--color-on-accent, #fff)' if k else 'currentColor'))
p.append(text((bx.x0 + bx.x1) / 2, bx.y1 + 42, 'Effective sample size after pruning', 12,
              anchor='middle'))
p.append(text(20, 24, 'The same 400 people, removed from one arm or the other', 11.5,
              opacity='.8'))
# The axis title sits at y1+42 = 174, so the closing note starts below it, not on it.
p.append(text(20, 198, 'Dropping the case costs 1,032 effective samples; dropping the control',
              10, opacity='.85'))
p.append(text(20, 212, 'costs 65 — sixteen times, the same ratio as the design lesson.', 10,
              opacity='.85'))
print('fig2 bytes:', write(os.path.join(OUT, 'gwas-quality-control-pruning.svg'),
                           svg(640, 226, ''.join(p))))
print('  drop controls %.4f  drop cases %.4f  ratio %.4f'
      % (neff(10000, 39600), neff(9600, 40000),
         (BASE - neff(9600, 40000)) / (BASE - neff(10000, 39600))))
