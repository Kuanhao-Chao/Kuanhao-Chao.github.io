import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, Axes, ACCENT

# LOEUF has a floor set by how much sequence a gene has, not by how constrained it is.
# With zero observed LoF variants the 90% Poisson upper bound is chi2(0.95, 2)/2 = 2.996,
# so the lowest LOEUF a gene can possibly reach is 2.996 / expected. Everything below that
# curve is unreachable at that gene size — which is why short genes cannot be called
# constrained however perfectly they are observed.
FLOOR_K0 = 2.9957322735539909  # 0.5 * chi2Quantile(0.95, 2); recomputed in the lesson tests
THRESH = 0.35

floor = lambda e: FLOOR_K0 / e
cross = FLOOR_K0 / THRESH

ax = Axes(78.0, 606.0, 30.0, 246.0, (1.5, 300), (0, 2), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 0.5, 1.0, 1.5, 2.0], ['0', '0.5', '1.0', '1.5', '2.0']))
o.append(ax.xticks([2, 5, 10, 30, 100, 300], ['2', '5', '10', '30', '100', '300']))

# the constrained-bin threshold
o.append(line(ax.x0, ax.py(THRESH), ax.x1, ax.py(THRESH), 1.5, stroke=ACCENT, dash='6 4'))
o.append(text(ax.x1 - 4, ax.py(THRESH) - 7, 'LOEUF = 0.35, the constrained bin', 10.5,
              anchor='end', fill=ACCENT, weight='600'))

o.append(ax.curve(floor, n=160, width=2))
o.append(text(ax.px(3.4), ax.py(floor(3.4)) - 8, 'floor: zero LoF observed', 11, opacity='.85'))

# where the floor first reaches the threshold
o.append(line(ax.px(cross), ax.py(THRESH), ax.px(cross), ax.y1, 1, opacity='.3', dash='3 3'))
o.append(circle(ax.px(cross), ax.py(THRESH), 4.5, fill=ACCENT))
o.append(text(ax.px(cross) + 8, ax.py(THRESH) + 16,
              '%.2f expected — below this, no gene can reach the bin' % cross, 10.5,
              fill=ACCENT, weight='600'))

# the worked-example genes
PTS = [(2.1, 1.4265, 'obs 0 of 2.1 expected', 'start', 10),
       (25.3, 0.3065, 'obs 3 of 25.3', 'middle', -12),
       (100.0, 0.1944, 'obs 12 of 100', 'middle', -12)]
for e, v, lab, anch, dy in PTS:
    o.append(circle(ax.px(e), ax.py(v), 4, fill='currentColor'))
    o.append(text(ax.px(e) + (8 if anch == 'start' else 0), ax.py(v) + dy, lab, 10.5,
                  anchor=anch, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 286, 'Expected LoF variants in the gene (log scale)', 12, anchor='middle'))
o.append(text(18, 138, 'LOEUF', 12, anchor='middle', extra='transform="rotate(-90 18 138)"'))
o.append(text((ax.x0 + ax.x1) / 2, 18,
              'The area under the curve is unreachable: no gene of that size can score there', 11.5,
              anchor='middle', opacity='.8'))

print('  floor crosses 0.35 at expected = %.4f' % cross)
for e, v, *_ in PTS: print('  expected %-6.1f LOEUF %.4f  (floor here %.4f)' % (e, v, floor(e)))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-constraint-intolerance.svg'),
                      svg(640, 300, ''.join(o))))
