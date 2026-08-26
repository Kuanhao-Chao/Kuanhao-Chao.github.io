import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# Both series are the exact output of src/lib/deepDiveMath.ts under its own seededNormals
# generator, pasted as literals so the drawing and the tests cannot drift apart. Every value
# is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
GRID = [2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 320, 500, 800, 1300, 2000]
PURITY = [96.403, 95.208, 92.431, 89.833, 88.778, 83.0, 79.708, 74.778, 68.264,
          63.806, 58.681, 52.139, 48.431, 44.472, 43.056, 41.472]
CONTRAST = [107.2234, 27.3278, 9.1256, 4.3779, 2.4521, 1.5205, 1.1417, 0.7621, 0.5581,
            0.433, 0.3241, 0.2534, 0.1997, 0.1545, 0.1173, 0.0942]
CHANCE = 100 * 29 / 89          # three equal clusters, 29 of the other 89 share your label

# ── 1 · Adding dimensions that contain nothing destroys the graph ────────────
# 90 cells in three clusters, separated by three standard deviations in dimensions 0 and 1
# ONLY. Every further dimension is pure noise carrying no information at all -- the signal is
# byte-identical across the whole x-axis. What changes is only how much noise is piled on it.
ax = Axes(112.0, 424.0, 44.0, 232.0, (2.0, 2000.0), (0.0, 100.0), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([2, 10, 100, 1000], ['2', '10', '100', '1,000']))

o.append(line(ax.x0, ax.py(CHANCE), ax.x1, ax.py(CHANCE), 1.8, opacity='.55', dash='6 4'))
# labelled at the left, where the curve is up at 96% and the band below the line is empty
o.append(text(ax.x0 + 6, ax.py(CHANCE) + 16, 'chance, 32.6%', 10, opacity='.75'))

o.append(path([(ax.px(d), ax.py(v)) for d, v in zip(GRID, PURITY)], width=2.4, stroke=ACCENT))
READ = []
for d in (2, 30, 2000):
    v = PURITY[GRID.index(d)]
    READ.append((d, '%.1f%%' % (round(v * 10) / 10)))
    o.append(circle(ax.px(d), ax.py(v), 4.2, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Dimensions the graph is built in', 12,
              anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'kNN edges joining the same cluster', 11, opacity='.8'))

LX = ax.x1 + 26
o.append(text(LX, 60, 'The signal never changes.', 11, weight='700'))
for i, (d, lab) in enumerate(READ):
    o.append(text(LX, 80 + 16 * i, '%s dims' % ('{:,}'.format(d)), 10, opacity='.8'))
    o.append(text(LX + 104, 80 + 16 * i, lab, 10, anchor='end', fill=ACCENT, weight='600'))
for i, t in enumerate(['Three clusters, three standard', 'deviations apart, in two',
                       'dimensions. Every dimension', 'past the second is noise and',
                       'carries nothing.', '',
                       'Piling that noise on takes the', 'graph from 96.4% correct to',
                       '41.5%, against a chance rate of', '32.6%. That is 86.1% of what',
                       'the graph knew, gone - and not', 'one bit of signal was removed',
                       'to do it.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-neighbor-purity.svg'), svg(772, 336, ''.join(o)))

# ── 2 · Why: every distance converges on the same number ────────────────────
# Relative contrast (d_max - d_min)/d_min from a query point to a 1,000-point cloud, averaged
# over twenty queries. On log-log the decay is a straight line of slope about -1/2.
o = []
ax = Axes(120.0, 424.0, 44.0, 232.0, (2.0, 2000.0), (0.05, 200.0), xlog=True, ylog=True)
o.append(ax.frame())
o.append(ax.ygrid([0.05, 0.5, 5, 50], ['0.05', '0.5', '5', '50'], size=10))
o.append(ax.xticks([2, 10, 100, 1000], ['2', '10', '100', '1,000']))

# the 1/sqrt(d) reference, anchored at the right-hand end where the law has taken hold
ref = lambda d: CONTRAST[-1] * math.sqrt(2000.0 / d)
o.append(ax.curve(ref, n=120, width=1.8, opacity='.45', dash='5 3'))
# labelled far left, where the reference sits a clear five-fold below the curve
o.append(text(ax.px(5.0), ax.py(ref(5.0)) + 16, 'a 1/sqrt(d) line', 10, anchor='middle',
              opacity='.7'))

o.append(path([(ax.px(d), ax.py(v)) for d, v in zip(GRID, CONTRAST)], width=2.4, stroke=ACCENT))
# the two readings go in the margin: the curve and its reference converge at the right-hand
# end, so any inline label for one lands on the other
READ2 = []
for d in (30, 2000):
    v = CONTRAST[GRID.index(d)]
    READ2.append((d, '%.2f' % (round(v * 100) / 100)))
    o.append(circle(ax.px(d), ax.py(v), 4.2, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.05) + 40, 'Dimensions', 12, anchor='middle'))
o.append(text(ax.x0 - 98, 26, 'Relative contrast, (far - near) / near', 11, opacity='.8'))

LX = ax.x1 + 26
o.append(text(LX, 60, 'Nothing is near anything.', 11, weight='700'))
for i, (d, lab) in enumerate(READ2):
    o.append(text(LX, 80 + 16 * i, '%s dims' % ('{:,}'.format(d)), 10, opacity='.8'))
    o.append(text(LX + 104, 80 + 16 * i, lab, 10, anchor='end', fill=ACCENT, weight='600'))
for i, t in enumerate(['At 2,000 dimensions the most', 'distant of a thousand points',
                       'is 9% further away than the', 'closest one. There is almost',
                       'no such thing as a nearest', 'neighbour left to find.', '',
                       'The decay is about 1/sqrt(d):', 'from 500 to 2,000 dimensions',
                       'the contrast falls 2.12-fold', 'against a predicted 2.00. It is',
                       'not yet that clean at 30.']):
    o.append(text(LX, 128 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-distance-contrast.svg'), svg(772, 322, ''.join(o)))
print('wrote sc-neighbor-purity.svg, sc-distance-contrast.svg')
