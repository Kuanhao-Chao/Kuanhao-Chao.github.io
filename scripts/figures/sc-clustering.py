import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# A ring of 40 complete K5 cliques joined in a ring by single edges: 200 nodes, 440 edges,
# forty maximally separable communities. Grouping g consecutive cliques together gives
#     Q(gamma) = 1 - 1/(11g) - gamma*g/40,
# a straight line in gamma. Verified against graphModularity in deepDiveExamples.test.ts,
# where every number drawn here is recomputed.
GROUPS = [(1, 40), (2, 20), (4, 10), (5, 8), (8, 5), (10, 4)]
Q = lambda g, gam: 1 - 1.0 / (11 * g) - gam * g / 40.0
GSTAR = 20.0 / 11.0                     # exact: Q(1) = Q(2) here
GLOW = 5.0 / 11.0                       # exact: Q(2) = Q(4); the plateau is exactly 4x wide

# ── 1 · The best-scoring partition is the wrong one ──────────────────────────
ax = Axes(112.0, 424.0, 44.0, 232.0, (0.4, 3.0), (0.2, 1.0))
o = [ax.frame()]
o.append(ax.ygrid([0.2, 0.4, 0.6, 0.8, 1.0], ['0.2', '0.4', '0.6', '0.8', '1.0']))
o.append(ax.xticks([0.5, 1.0, 1.5, 2.0, 2.5, 3.0], ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0']))

for g, comms in GROUPS:
    accent = comms == 40
    o.append(path([(ax.px(0.4), ax.py(Q(g, 0.4))), (ax.px(3.0), ax.py(Q(g, 3.0)))],
                  width=2.4 if accent else 1.8, stroke=ACCENT if accent else 'currentColor',
                  opacity=None if accent else '.5'))

# the default, and the point where the truth finally wins
for xv, lab, dy in ((1.0, 'the default, 1.0', 0), (GSTAR, 'truth wins past 1.82', 13)):
    o.append(line(ax.px(xv), ax.py(0.2), ax.px(xv), ax.py(1.0), 1.2, opacity='.4', dash='4 3'))
    o.append(text(ax.px(xv) + 7, ax.py(1.0) + 12 + dy, lab, 10, opacity='.75'))

o.append(circle(ax.px(1.0), ax.py(Q(1, 1.0)), 4.2, fill=ACCENT))
o.append(circle(ax.px(1.0), ax.py(Q(2, 1.0)), 4.2, fill='currentColor'))
o.append(circle(ax.px(GSTAR), ax.py(Q(1, GSTAR)), 4.2, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.2) + 40, 'Resolution', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Modularity', 11, opacity='.8'))

LX = ax.x1 + 26
o.append(text(LX, 58, 'communities scored', 10, opacity='.6'))
for i, (g, comms) in enumerate(GROUPS):
    yy = 76 + 15 * i
    accent = comms == 40
    o.append(line(LX, yy - 4, LX + 20, yy - 4, 2.2, stroke=ACCENT if accent else 'currentColor',
                  opacity=None if accent else '.5'))
    o.append(text(LX + 28, yy, '%d%s' % (comms, ' (the truth)' if accent else ''), 10,
                  fill=ACCENT if accent else 'currentColor',
                  opacity=None if accent else '.7', weight='600' if accent else None))

o.append(text(LX, 182, 'The truth loses.', 11, weight='700'))
for i, t in enumerate(['At the default resolution the', 'forty-community answer scores',
                       '0.884 and the twenty-community', 'answer scores 0.905. Every one',
                       'of those twenty is two complete', 'cliques fused.', '',
                       'The lines cross at exactly', '20/11. Nothing in the data',
                       'says to go there.']):
    o.append(text(LX, 200 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-modularity-resolution.svg'), svg(772, 348, ''.join(o)))

# ── 2 · The wrong answer is stable across everything you would try ───────────
BANDS = [(0.40, GLOW, 10, '0.33'), (GLOW, GSTAR, 20, '0.60'), (GSTAR, 3.00, 40, '1.00')]
ax = Axes(112.0, 424.0, 44.0, 216.0, (0.4, 3.0), (0.0, 45.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 10, 20, 30, 40], ['0', '10', '20', '30', '40'], emphasise=(40,)))
o.append(ax.xticks([0.5, 1.0, 1.5, 2.0, 2.5, 3.0], ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0']))

for lo, hi, comms, ari in BANDS:
    accent = comms == 40
    o.append(rect(ax.px(lo), ax.py(comms), ax.px(hi) - ax.px(lo), 3.0,
                  fill=ACCENT if accent else 'currentColor', opacity='.9' if accent else '.55'))
    # a band too narrow to hold its own label gets it alongside instead of centred,
    # or the text runs off the left of the frame
    lab = '%d communities, ARI %s' % (comms, ari)
    if ax.px(hi) - ax.px(lo) < 100:
        o.append(text(ax.px(hi) + 8, ax.py(comms) + 4, lab, 10,
                      fill=ACCENT if accent else 'currentColor',
                      weight='600' if accent else None, opacity=None if accent else '.85'))
    else:
        o.append(text((ax.px(lo) + ax.px(hi)) / 2, ax.py(comms) - 9, lab, 10, anchor='middle',
                      fill=ACCENT if accent else 'currentColor',
                      weight='600' if accent else None, opacity=None if accent else '.85'))

o.append(line(ax.px(1.0), ax.py(0.0), ax.px(1.0), ax.py(45.0), 1.2, opacity='.4', dash='4 3'))
o.append(text(ax.px(1.0) + 7, ax.py(45.0) + 12, 'the default', 10, opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Resolution', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Communities returned', 11, opacity='.8'))

LX = ax.x1 + 26
o.append(text(LX, 62, 'Stable, and wrong.', 11, weight='700'))
for i, t in enumerate(['Twenty communities is the', 'answer everywhere from 5/11 to',
                       '20/11 - a range exactly four-', 'fold wide, covering every',
                       'resolution anyone would try.', '',
                       'Re-running across resolutions', 'and finding the same clusters',
                       'is therefore not evidence they', 'are right. Here it is evidence',
                       'of a plateau that happens to', 'be the wrong plateau.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-resolution-plateau.svg'), svg(772, 300, ''.join(o)))
print('wrote sc-modularity-resolution.svg, sc-resolution-plateau.svg')
