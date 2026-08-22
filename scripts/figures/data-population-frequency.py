import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, Axes, ACCENT, circle

# What a zero observation can and cannot exclude, as a function of how many chromosomes
# were actually genotyped. The curve is the exact Wilson upper bound at k = 0, which is
# z^2/(n + z^2) — derived in the lesson, so the figure and the algebra are the same object.
Z2 = 1.959963984540054 ** 2
upper = lambda n: Z2 / (n + Z2)
MAXAF = 8e-6

ax = Axes(78.0, 606.0, 28.0, 250.0, (1e3, 1e7), (1e-7, 1e-2), xlog=True, ylog=True)
o = [ax.frame()]

o.append(ax.ygrid([1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2],
                  ['1e-7', '1e-6', '1e-5', '1e-4', '1e-3', '1e-2']))
o.append(ax.xticks([1e3, 1e4, 1e5, 1e6, 1e7], ['1k', '10k', '100k', '1M', '10M']))

# the disease threshold this frequency has to beat
o.append(line(ax.x0, ax.py(MAXAF), ax.x1, ax.py(MAXAF), 1.5, dash='6 4', stroke=ACCENT))
o.append(text(ax.x1 - 6, ax.py(MAXAF) - 7, 'maximum credible AF for the example disease, 8e-6',
              10.5, anchor='end', fill=ACCENT, weight='600'))

o.append(ax.curve(upper, n=160, width=2))

# where a zero observation finally excludes the threshold
ncross = Z2 * (1 / MAXAF - 1)
o.append(circle(ax.px(ncross), ax.py(MAXAF), 4.5, fill=ACCENT))
o.append(text(ax.px(ncross), ax.py(MAXAF) + 20, 'AN = 480,000', 10.5,
              anchor='middle', fill=ACCENT, weight='600'))

# The two cohorts from the worked example. Labels go beside or below their marker, never
# above: the crossing-point label already sits under the threshold line, and the curve
# runs through the space above each point.
for n, lab, dx, anchor in [(6_000, 'a 3,000-person cohort', 9, 'start'),
                           (1_604_818, 'gnomAD v4.1.1', 0, 'middle')]:
    o.append(line(ax.px(n), ax.py(upper(n)), ax.px(n), ax.y1, 1, opacity='.28', dash='3 3'))
    o.append(circle(ax.px(n), ax.py(upper(n)), 3.5, fill='currentColor'))
    dy = 4 if anchor == 'start' else 18
    o.append(text(ax.px(n) + dx, ax.py(upper(n)) + dy, lab, 10, anchor=anchor, opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, 290, 'Chromosomes genotyped, AN (log scale)', 12, anchor='middle'))
o.append(text(18, 139, 'Upper 95% bound on AF when nothing is seen', 11.5, anchor='middle',
              extra='transform="rotate(-90 18 139)"'))
o.append(text((ax.x0 + ax.x1) / 2, 18,
              'Seeing no carriers only excludes frequencies above this line', 11.5,
              anchor='middle', opacity='.8'))

print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-population-frequency.svg'), svg(640, 302, ''.join(o))))
print('crossing AN = %.0f' % ncross)
