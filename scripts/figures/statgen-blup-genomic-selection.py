import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: what shrinkage does to three records ───────────────────────────
# The BLUP solution for the worked example's pedigree, drawn against the raw records it
# started from. The point is the two things shrinkage does at once: it pulls every estimate
# toward the mean, and it produces estimates for two animals that have no record at all.
ANIMALS = [('sire A', None, 0.223529), ('sire B', None, -0.223529), ('dam D', None, 0.0),
           ('calf 4', 4.5, 0.163529), ('calf 5', 5.1, 0.283529), ('calf 6', 2.9, -0.335294)]
MU = 4.129412

ax = Axes(120.0, 470.0, 52.0, 236.0, (-1.35, 1.05), (-1.0, 5.4))
o = [ax.frame()]
o.append(ax.xticks([-1.2, -0.8, -0.4, 0.0, 0.4, 0.8],
                   ['-1.2', '-0.8', '-0.4', '0', '+0.4', '+0.8']))

ROWY = {}
for k, (name, rec, ebv) in enumerate(ANIMALS):
    y = ax.py(5.0 - k)
    ROWY[name] = y
    o.append(text(ax.x0 - 12, y + 4, name, 10.5, anchor='end', weight='600'))
    if rec is not None:
        raw = rec - MU
        o.append(line(ax.px(raw), y, ax.px(ebv), y, 1.4, opacity='.45', dash='3 3'))
        o.append(circle(ax.px(raw), y, 4, fill='currentColor', opacity='.45'))
        o.append(text(ax.px(raw), y - 10, '%+.3f' % raw, 9.5, anchor='middle', opacity='.6'))
    o.append(circle(ax.px(ebv), y, 5, fill=ACCENT))
    o.append(text(ax.px(ebv), y + 16, '%+.3f' % ebv, 9.5, anchor='middle', fill=ACCENT,
                  weight='600'))

o.append(line(ax.px(0), ax.py(-1.0), ax.px(0), ax.py(5.4), 1.25, opacity='.4', dash='4 3'))
o.append(text(ax.px(0), ax.py(5.4) - 8, 'population mean', 10, anchor='middle', opacity='.7'))

LX = ax.x1 + 14
o.append(circle(LX + 6, 74, 4, fill='currentColor', opacity='.45'))
o.append(text(LX + 18, 78, 'record, as a deviation', 10, opacity='.8'))
o.append(circle(LX + 6, 94, 5, fill=ACCENT))
o.append(text(LX + 18, 98, 'BLUP estimate', 10, opacity='.8'))
o.append(text(LX, 132, 'Two things at once:', 11, weight='700'))
for i, t in enumerate(['every record is pulled', 'toward the mean, and the',
                       'three animals with no', 'record get estimates from',
                       'their relatives.']):
    o.append(text(LX, 148 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 226, 'dam D is confounded', 11, weight='700'))
o.append(text(LX, 242, 'with the mean, so BLUP', 10, opacity='.8'))
o.append(text(LX, 255, 'returns exactly zero.', 10, opacity='.8'))

o.append(text((ax.x0 + ax.x1) / 2, 272, 'Deviation from the population mean', 12, anchor='middle'))
o.append(text(20, 22, 'BLUP shrinks what it measured, and predicts what it did not',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-blup-genomic-selection-shrinkage.svg'),
                           svg(640, 288, ''.join(o))))

# ── Figure 2: prediction accuracy against training size ──────────────────────
ME = 10000
acc = lambda n, h2: math.sqrt(n * h2 / (n * h2 + ME))

ax2 = Axes(90.0, 452.0, 46.0, 244.0, (500.0, 200000.0), (0.0, 1.0), xlog=True)
p = [ax2.frame()]
p.append(ax2.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1.00']))
p.append(ax2.xticks([1e3, 1e4, 1e5], ['1,000', '10,000', '100,000']))
for h2, dash in ((0.6, None), (0.3, '7 4'), (0.1, '2 4')):
    p.append(ax2.curve(lambda n, h2=h2: acc(n, h2), n=240, width=2,
                       stroke=ACCENT if h2 == 0.3 else 'currentColor',
                       dash=dash, opacity=None if h2 == 0.3 else '.8'))

for n in (20000, 50000):
    p.append(circle(ax2.px(n), ax2.py(acc(n, 0.3)), 4.5, fill=ACCENT))
LX = ax2.x1 + 14
p.append(text(LX, 80, 'h² = 0.6', 10.5, weight='600'))
p.append(text(LX, 100, 'h² = 0.3', 10.5, weight='600', fill=ACCENT))
p.append(text(LX, 120, 'h² = 0.1', 10.5, weight='600'))
p.append(text(LX, 152, 'Mₑ = 10,000', 11, weight='700'))
for i, t in enumerate(['independent chromosome', 'segments. Accuracy is set',
                       'by Nh² against Mₑ, so a', 'low-heritability trait needs',
                       'proportionally more data.']):
    p.append(text(LX, 168 + 13 * i, t, 10, opacity='.8'))
# the two marked points, named here rather than in the plot: below and right of each dot is
# where the next curve down runs, and above it is the previous one.
p.append(text(LX, 250, 'on the h² = 0.3 curve', 11, weight='700', fill=ACCENT))
p.append(text(LX, 266, 'N = 20,000 → r = 0.6124', 10, opacity='.85'))
p.append(text(LX, 279, 'N = 50,000 → r = 0.7746', 10, opacity='.85'))

p.append(text((ax2.x0 + ax2.x1) / 2, 288, 'Training population size N (log scale)', 12,
              anchor='middle'))
p.append(text(20, 145, 'Accuracy of prediction, r', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 145)"'))
p.append(text(20, 22, 'What a reference population buys: accuracy against training size',
              11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-blup-genomic-selection-accuracy.svg'),
                           svg(640, 316, ''.join(p))))
print('  r(20k, .3) %.6f   r(50k, .3) %.6f   r2 %.4f / %.4f'
      % (acc(20000, .3), acc(50000, .3), acc(20000, .3) ** 2, acc(50000, .3) ** 2))
