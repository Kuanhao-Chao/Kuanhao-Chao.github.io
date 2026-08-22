import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, Axes, ACCENT

# The same predictor, scored two ways. On the left it is compared with the assay in the
# assay's units and looks poor; on the right the two rankings are compared and it is
# perfect. Nothing about the predictor differs between the panels.
Y = [-3.2, -2.1, -1.5, -0.4, 0.1, 0.6, 1.2, 2.0]
P = [1 / (1 + math.exp(-v)) for v in Y]
rank = lambda xs: [sorted(xs).index(v) + 1 for v in xs]

o = []
o.append(text(320, 18, 'One predictor, two verdicts', 12, anchor='middle', weight='600'))

# ── left: values against values ──────────────────────────────────────────────
axL = Axes(64.0, 288.0, 46.0, 250.0, (-4, 3), (-4, 3))
o.append(axL.frame())
o.append(axL.ygrid([-4, -2, 0, 2], ['-4', '-2', '0', '2']))
o.append(axL.xticks([-4, -2, 0, 2], ['-4', '-2', '0', '2']))
o.append(line(axL.px(-4), axL.py(-4), axL.px(3), axL.py(3), 1, opacity='.35', dash='4 4'))
o.append(text(axL.px(1.4), axL.py(2.3), 'y = x', 10, opacity='.6'))
for y, p in zip(Y, P):
    o.append(circle(axL.px(y), axL.py(p), 4, fill=ACCENT))
    o.append(line(axL.px(y), axL.py(p), axL.px(y), axL.py(y), 1, opacity='.3'))
o.append(text(176, 286, 'Assay score', 11, anchor='middle'))
o.append(text(20, 148, 'Predicted score', 11, anchor='middle', extra='transform="rotate(-90 20 148)"'))
rmse = math.sqrt(sum((p - y) ** 2 for y, p in zip(Y, P)) / len(Y))
o.append(text(176, 36, 'RMSE = %.4f' % rmse, 11, anchor='middle', weight='600'))

# ── right: ranks against ranks ───────────────────────────────────────────────
axR = Axes(376.0, 600.0, 46.0, 250.0, (0, 9), (0, 9))
o.append(axR.frame())
o.append(axR.ygrid([0, 2, 4, 6, 8], ['0', '2', '4', '6', '8']))
o.append(axR.xticks([0, 2, 4, 6, 8], ['0', '2', '4', '6', '8']))
o.append(line(axR.px(0), axR.py(0), axR.px(9), axR.py(9), 1, opacity='.35', dash='4 4'))
for ry, rp in zip(rank(Y), rank(P)):
    o.append(circle(axR.px(ry), axR.py(rp), 4, fill=ACCENT))
o.append(text(488, 286, 'Assay rank', 11, anchor='middle'))
o.append(text(332, 148, 'Predicted rank', 11, anchor='middle', extra='transform="rotate(-90 332 148)"'))
o.append(text(488, 36, 'Spearman = 1.0000', 11, anchor='middle', weight='600', fill=ACCENT))

o.append(text(320, 308,
              'A monotone rescale costs no information and RMSE sees nothing else',
              11, anchor='middle', opacity='.75'))

print('  RMSE %.4f   ranks identical: %s' % (rmse, rank(Y) == rank(P)))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-protein-benchmarks.svg'),
                      svg(640, 322, ''.join(o))))
