import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-population-structure-fst.mdx')

# ── Figure 1 ── the cliff is in the eigenvector, not the eigenvalue ───────────
# Curve is the BBP closed form (1 - g/L^2)/(1 + g/L); points are the mean squared overlap
# between the leading sample eigenvector and the true +-1 population axis over 5 replicate
# Balding-Nichols simulations at N=200, M=2000 (gamma = 0.1). Every drawn value is asserted
# in src/lib/deepDiveExamples.test.ts.
GAMMA = 0.1
SQ = math.sqrt(GAMMA)
SIM = [(0.316, 0.0210), (0.632, 0.0144), (1.000, 0.1919), (1.581, 0.5239),
       (2.530, 0.7596), (3.984, 0.8695), (6.325, 0.9392)]


def overlap(u):
    """u = lambda / sqrt(gamma)."""
    lam = u * SQ
    return 0.0 if lam <= SQ else (1 - GAMMA / lam ** 2) / (1 + GAMMA / lam)


ax = Axes(104.0, 430.0, 40.0, 236.0, (0.0, 6.6), (0.0, 1.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1'], size=10))
o.append(ax.xticks([0, 1, 2, 3, 4, 5, 6], ['0', '1', '2', '3', '4', '5', '6']))

# the transition, drawn before the data so the curve reads on top of it
xt = ax.px(1.0)
o.append(line(xt, ax.y0, xt, ax.y1, 2.0, opacity='.85', dash='6 4'))
o.append(text(xt + 7, ax.y0 + 13, 'transition', 10, opacity='.85', weight='600'))

# flat zero to the left: the part people assume is "a weak signal"
o.append(path([(ax.px(0.0), ax.py(0.0)), (xt, ax.py(0.0))], width=3.0, stroke=ACCENT))
o.append(path([(ax.px(1.0 + i * 5.6 / 160), ax.py(overlap(1.0 + i * 5.6 / 160)))
               for i in range(161)], width=3.0, stroke=ACCENT))
for u, v in SIM:
    o.append(circle(ax.px(u), ax.py(v), 3.6, fill='currentColor', opacity='.8'))

# no in-plot label for the flat segment: the only clear space left of the transition is
# 49px wide and every phrasing collided with the dashed line. The margin column says it.
# the closed form at this x is exactly 1/2; ring it so it is not read as the nearby
# simulation point, which is 0.5239
o.append(circle(ax.px(1.581), ax.py(0.5), 4.6, fill=None, stroke=ACCENT, sw=2.0))
o.append(text(ax.px(1.581) + 10, ax.py(0.5) + 14, '0.50', 10.5, fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 42,
              'Spike relative to the transition,  N F_{ST} / \u221a(N/M)', 12, anchor='middle'))
o.append(text(ax.x0 - 78, 24, 'Squared overlap of the leading PC with the true axis', 10.5, opacity='.85'))

LX = ax.x1 + 26
o.append(circle(LX + 8, 36, 3.6, fill='currentColor', opacity='.8'))
o.append(text(LX + 22, 40, 'simulation, N = 200, M = 2,000', 10, opacity='.8'))
o.append(circle(LX + 8, 53, 4.6, fill=None, stroke=ACCENT, sw=2.0))
o.append(text(LX + 22, 57, 'closed form at gamma = 0.1', 10, fill=ACCENT, weight='600'))

o.append(text(LX, 85, 'Below the transition there', 11, weight='700'))
o.append(text(LX, 99, 'is nothing to find.', 11, weight='700'))
for i, t in enumerate([
        'The leading PC is a random',
        'direction, not a faint version',
        'of the truth: the overlap is',
        'exactly zero in the limit. The',
        'two points left of the line sit',
        'at 0.02 and 0.01, against a',
        'random-vector baseline of',
        '1/200 = 0.005. The point on the',
        'line reads 0.19 - finite-size',
        'smearing, largest exactly at a',
        'critical point.', '',
        'The eigenvalue is no help. It',
        'leaves the bulk edge with zero',
        'derivative, so a scree plot',
        'looks unremarkable at exactly',
        'the divergence where the PC',
        'becomes usable: 1% past the',
        'transition it is within 0.1% of',
        'the edge, while the overlap is',
        'already 0.2418 at 20% past.', '',
        'The threshold at 1 is universal;',
        'this climb is drawn for one',
        'aspect ratio.']):
    o.append(text(LX, 121 + 13 * i, t, 10, opacity='.8'))

svg1 = svg(772, 400, ''.join(o))
write(os.path.join(OUT, 'statgen-bbp-transition.svg'), svg1)
splice(MDX, 0, svg1)
print('wrote statgen-bbp-transition.svg')

# ── Figure 2 ── stratification is linear in N, so more data makes it worse ────
DELTA = 0.2
SERIES = [(0.0005, 'F_{ST} = 0.0005', '5 3'), (0.001, 'F_{ST} = 0.001', None),
          (0.01, 'F_{ST} = 0.01', '2 3')]

ax2 = Axes(104.0, 400.0, 40.0, 236.0, (1e3, 1e6), (1.0, 120.0), xlog=True, ylog=True)
o = [ax2.frame()]
o.append(ax2.ygrid([1, 2, 5, 10, 30, 100], ['1', '2', '5', '10', '30', '100'], size=10))
o.append(ax2.xticks([1e3, 1e4, 1e5, 1e6], ['1,000', '10,000', '100,000', '1,000,000']))

for fst, lab, dash in SERIES:
    o.append(ax2.curve(lambda n, f=fst: 1 + n * f * DELTA ** 2 / 4, n=160,
                       width=2.4, stroke=ACCENT if dash is None else 'currentColor',
                       dash=dash, opacity=None if dash is None else '.85'))

# the three values the worked example publishes, on the solid F_ST = 0.001 curve
for n, v in ((10_000, 1.1), (100_000, 2.0), (1_000_000, 11.0)):
    o.append(circle(ax2.px(n), ax2.py(v), 3.6, fill=ACCENT))
# 1.10 sits where the log axis is most compressed and every placement hit either the
# dotted series or the tick labels; the dot stays, the number is in the margin and prose.
o.append(text(ax2.px(100_000) - 8, ax2.py(2.0) - 9, '2.00', 10.5, anchor='end',
              fill=ACCENT, weight='600'))
o.append(text(ax2.px(1_000_000) - 8, ax2.py(11.0) - 9, '11.00', 10.5, anchor='end',
              fill=ACCENT, weight='600'))

o.append(text((ax2.x0 + ax2.x1) / 2, ax2.py(1.0) + 42, 'Sample size N', 12, anchor='middle'))
o.append(text(ax2.x0 - 78, 24, 'Expected \u03c7\u00b2 at a variant with no effect', 10.5, opacity='.85'))

LX = ax2.x1 + 52
for i, (fst, lab, dash) in enumerate(SERIES):
    yy = 40 + 17 * i
    solid = dash is None
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.4,
                  stroke=ACCENT if solid else 'currentColor', dash=dash,
                  opacity=None if solid else '.85'))
    o.append(text(LX + 30, yy, lab, 10, fill=ACCENT if solid else 'currentColor',
                  opacity=None if solid else '.85', weight='600' if solid else None))

o.append(text(LX, 116, 'Confounding that grows', 11, weight='700'))
o.append(text(LX, 130, 'with the cure.', 11, weight='700'))
for i, t in enumerate([
        'E[\u03c7\u00b2] = 1 + N F_{ST} \u03b4\u00b2/4, linear',
        'in N. Collecting more people',
        'does not average this away -',
        'it multiplies it.', '',
        'At the within-Europe divergence',
        'of 0.001 and a trait gap of 0.2',
        'standard deviations, a study of',
        '10,000 is inflated 10%; the same',
        'study at 1,000,000 is inflated',
        'eleven-fold, at every null',
        'variant in the genome.', '',
        'This is why the fix has to be',
        'structural rather than a',
        'constant divisor.']):
    o.append(text(LX, 152 + 13 * i, t, 10, opacity='.8'))

svg2 = svg(772, 400, ''.join(o))
write(os.path.join(OUT, 'statgen-stratification-n.svg'), svg2)
splice(MDX, 1, svg2)
print('wrote statgen-stratification-n.svg')
