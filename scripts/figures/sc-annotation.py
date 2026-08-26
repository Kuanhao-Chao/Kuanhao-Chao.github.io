import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# R = 1 + (1-alpha)E/alpha, bounded by R_max = 1 + (1-alpha)/(alpha*phi). Every value is
# recomputed from deepDiveMath in src/lib/deepDiveExamples.test.ts.
rmax = lambda a, phi: 1 + (1 - a) / (a * phi)

# ── 1 · The ceiling is set by the run, not by the gene ───────────────────────
ax = Axes(112.0, 412.0, 44.0, 232.0, (0.005, 0.30), (2.0, 20000.0), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([10, 100, 1000, 10000], ['10', '100', '1,000', '10,000'], size=10))
o.append(ax.xticks([0.01, 0.03, 0.1, 0.3], ['1%', '3%', '10%', '30%']))

PHIS = [(0.01, '.35'), (0.05, '.5'), (0.20, '.68'), (0.60, None)]
for phi, op in PHIS:
    o.append(ax.curve(lambda a, phi=phi: rmax(a, phi), n=200, width=2.4 if op is None else 1.9,
                      stroke=ACCENT if op is None else 'currentColor', opacity=op))
    o.append(text(ax.x1 + 6, ax.py(rmax(0.30, phi)) + 4, '%g%%' % (100 * phi), 10,
                  fill=ACCENT if op is None else 'currentColor', opacity=op,
                  weight='600' if op is None else None))
o.append(text(ax.x1 + 6, ax.py(rmax(0.30, 0.60)) + 18, 'of the soup', 9.5, opacity='.6'))

READ = []
for a in (0.01, 0.05, 0.10, 0.20):
    v = rmax(a, 0.60)
    READ.append((a, ('%.2f' % v).rstrip('0').rstrip('.')))
    o.append(circle(ax.px(a), ax.py(v), 4.0, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(2.0) + 40, 'Ambient fraction of the run', 12,
              anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Best contrast any marker can reach', 11, opacity='.8'))

LX = ax.x1 + 56
o.append(text(LX, 60, 'A marker of a 60% type', 11, weight='700'))
for i, (a, lab) in enumerate(READ):
    o.append(text(LX, 80 + 16 * i, '%g%% ambient' % (100 * a), 10, opacity='.8'))
    o.append(text(LX + 104, 80 + 16 * i, lab, 10, anchor='end', fill=ACCENT, weight='600'))
for i, t in enumerate(['The ceiling is a property of', 'the run and of how abundant',
                       'the cell type is - never of', 'which gene you picked.', '',
                       'Markers of abundant lineages', 'are the ruined ones, which is',
                       'exactly the lineage a rare', 'cluster must be shown to be',
                       'negative for.']):
    o.append(text(LX, 152 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-marker-ceiling.svg'), svg(772, 306, ''.join(o)))

# ── 2 · Three markers, one hundred-fold apart, one contrast ─────────────────
# A dumbbell per marker: expected counts in a hepatocyte and in a Kupffer cell. On a log axis
# the connector's LENGTH is the log contrast, so three equal connectors are the theorem.
PHI, ALPHA, DEPTH = 0.60, 0.05, 8000
MARKERS = [('albumin, 5% of a hepatocyte', 0.05),
           ('a marker ten times weaker', 0.005),
           ('a marker a hundred times weaker', 0.0005)]

ax = Axes(232.0, 424.0, 44.0, 200.0, (0.05, 2000.0), (0.0, 3.0), xlog=True)
o = [line(ax.x0, ax.py(0.0), ax.x0, ax.py(3.0), 1.25)]
for v in (0.1, 1, 10, 100, 1000):
    o.append(line(ax.px(v), ax.py(0.0), ax.px(v), ax.py(3.0), 1, '.12'))
    o.append(text(ax.px(v), ax.py(0.0) + 18, ('%g' % v) if v >= 1 else '0.1', 11,
                  anchor='middle', opacity='.75'))

for i, (name, x) in enumerate(MARKERS):
    yy = ax.py(2.5 - i * 0.9)
    s = PHI * x
    hep = DEPTH * ((1 - ALPHA) * x + ALPHA * s)
    kup = DEPTH * ALPHA * s
    o.append(line(ax.px(kup), yy, ax.px(hep), yy, 2.6, opacity='.45'))
    o.append(circle(ax.px(kup), yy, 5.0, fill=None, stroke='currentColor', sw=1.8,
                    opacity='.75'))
    o.append(circle(ax.px(hep), yy, 5.0, fill=ACCENT))
    o.append(text(ax.x0 - 8, yy + 4, name, 10.5, anchor='end'))
    o.append(text((ax.px(kup) + ax.px(hep)) / 2, yy - 11, '32.67x', 10, anchor='middle',
                  fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'Expected counts at 8,000 UMIs', 12, anchor='middle'))
o.append(text(ax.x0 + 6, 30, 'filled = hepatocyte, open = Kupffer cell', 10, opacity='.7'))

LX = ax.x1 + 26
o.append(text(LX, 62, 'The gene cancels.', 11, weight='700'))
for i, t in enumerate(['Three markers spanning a', 'hundred-fold in expression,',
                       'and three connectors of', 'identical length - because on',
                       'a log axis that length is the', 'contrast, and the contrast',
                       'does not depend on the gene.', '',
                       'Curating a better marker', 'moves both ends together and',
                       'changes nothing.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-marker-cancellation.svg'), svg(772, 290, ''.join(o)))
print('wrote sc-marker-ceiling.svg, sc-marker-cancellation.svg')
