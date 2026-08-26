import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-multiple-testing.mdx')

# ── Figure 1 ── three lines through one set of p-values ──────────────────────
P = [0.0001, 0.0008, 0.0021, 0.0115, 0.0120, 0.0130, 0.0140, 0.0290, 0.0360, 0.0450]
M, Q = 20, 0.05
H = sum(1.0 / i for i in range(1, M + 1))     # 3.5977
NMAX = 10

ax = Axes(104.0, 424.0, 40.0, 236.0, (0.5, NMAX + 0.5), (0.0, 0.055))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.01, 0.02, 0.03, 0.04, 0.05],
                  ['0', '0.01', '0.02', '0.03', '0.04', '0.05'], size=10))
o.append(ax.xticks(list(range(1, NMAX + 1)), [str(i) for i in range(1, NMAX + 1)], size=10))

# Bonferroni: one horizontal line
o.append(line(ax.x0, ax.py(Q / M), ax.x1, ax.py(Q / M), 2.0, opacity='.85', dash='2 3'))
# BY: the shallower staircase
o.append(path([(ax.px(i), ax.py(i * (Q / H) / M)) for i in range(1, NMAX + 1)],
              width=2.0, stroke='currentColor', opacity='.6', dash='6 3'))
# BH: the staircase that matters
o.append(path([(ax.px(i), ax.py(i * Q / M)) for i in range(1, NMAX + 1)],
              width=2.4, stroke=ACCENT))

for i, p in enumerate(P, 1):
    rejected = i <= 7
    o.append(circle(ax.px(i), ax.py(p), 4.0,
                    fill=ACCENT if rejected else 'currentColor',
                    opacity=None if rejected else '.45'))

# the step-up: rank 4 sits above its own line and is rejected regardless
o.append(circle(ax.px(4), ax.py(P[3]), 7.2, fill=None, stroke=ACCENT, sw=1.8))
o.append(line(ax.px(2.6), ax.py(0.0345), ax.px(3.75), ax.py(0.0145), 1.2, opacity='.55'))
o.append(text(ax.px(0.75), ax.py(0.0420), 'above its own line,', 10, fill=ACCENT, weight='600'))
o.append(text(ax.px(0.75), ax.py(0.0385), 'rejected anyway', 10, fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 42, 'Rank i of the sorted p-value', 12, anchor='middle'))
o.append(text(ax.x0 - 78, 24, 'p-value', 10.5, opacity='.85'))

LX = ax.x1 + 30
for i, (lab, col, op, dash) in enumerate((('BH:  i q / m', ACCENT, None, None),
                                          ('BY:  i q / (H_m m)', 'currentColor', '.6', '6 3'),
                                          ('Bonferroni:  q / m', 'currentColor', '.85', '2 3'))):
    yy = 40 + 17 * i
    o.append(line(LX, yy - 4, LX + 24, yy - 4, 2.2, stroke=col, opacity=op, dash=dash))
    o.append(text(LX + 32, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 116, 'Three lines, three counts.', 11, weight='700'))
for i, t in enumerate([
        'Twenty tests. BH rejects seven,',
        'Bonferroni three, and BY two.', '',
        'BY is not uniformly weaker than',
        'Bonferroni - the two lines cross',
        'at exactly rank H_m = 3.5977, so',
        'BY is stricter below that rank',
        'and more permissive above it.',
        'Here only three p-values are',
        'small enough to matter and all',
        'sit below the crossing, so BY',
        'loses.', '',
        'The ringed point is what makes',
        'BH a step-up procedure: it',
        'exceeds its own line at 0.0100',
        'and is rejected because rank 7',
        'passes at 0.0175.']):
    o.append(text(LX, 138 + 13 * i, t, 10, opacity='.8'))

svg1 = svg(772, 386, ''.join(o))
write(os.path.join(OUT, 'statgen-bh-staircase.svg'), svg1)
splice(MDX, 0, svg1)
print('wrote statgen-bh-staircase.svg')

# ── Figure 2 ── what Storey's correction is worth ────────────────────────────
# 20,000 tests, pi0 = 0.5, q = 0.05, 200 trials per point; alternatives at N(mu,1).
# The nominal threshold doubles at every point; the discovery count does not.
GAIN = [(0.222, 1.510), (0.507, 1.284), (0.744, 1.152), (0.890, 1.081), (0.960, 1.048)]

ax2 = Axes(104.0, 424.0, 40.0, 236.0, (0.15, 1.0), (1.0, 1.6))
o = [ax2.frame()]
o.append(ax2.ygrid([1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6],
                   ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6'], size=10,
                   emphasise=(1.0,)))
o.append(ax2.xticks([0.2, 0.4, 0.6, 0.8, 1.0], ['0.2', '0.4', '0.6', '0.8', '1.0']))

o.append(path([(ax2.px(p), ax2.py(g)) for p, g in GAIN], width=2.4, stroke=ACCENT))
for p, g in GAIN:
    o.append(circle(ax2.px(p), ax2.py(g), 4.0, fill=ACCENT))
o.append(text(ax2.px(0.222) + 10, ax2.py(1.510) + 4, '1.51×', 10.5, fill=ACCENT, weight='600'))
# no label on the right-hand point: every placement sat on the curve, and the margin
# already gives the range as 51% to 5%

o.append(text((ax2.x0 + ax2.x1) / 2, ax2.py(1.0) + 42, 'Per-test power of the true effects',
              12, anchor='middle'))
o.append(text(ax2.x0 - 78, 24, 'Discoveries with Storey, relative to BH', 10.5, opacity='.85'))

LX = ax2.x1 + 30
o.append(text(LX, 44, 'The threshold doubles', 11, weight='700'))
o.append(text(LX, 58, 'every time. The count', 11, weight='700'))
o.append(text(LX, 72, 'does not.', 11, weight='700'))
for i, t in enumerate([
        'Half of these 20,000 tests are',
        'real, so pi_0 = 0.5 and Storey',
        'runs BH at q/pi_0 = 0.10 rather',
        'than 0.05 - twice as permissive',
        'at every point on this curve.', '',
        'The extra discoveries range from',
        '51% to 5%. What decides it is',
        'the slope of the sorted p-value',
        'curve where it meets the',
        'staircase: shallow when the',
        'effects are weak, steep when',
        'they are strong.', '',
        'So the correction pays most',
        'exactly where power is worst,',
        'which is the opposite of the',
        'usual intuition about a',
        'refinement being a luxury.']):
    o.append(text(LX, 96 + 13 * i, t, 10, opacity='.8'))

svg2 = svg(772, 372, ''.join(o))
write(os.path.join(OUT, 'statgen-storey-gain.svg'), svg2)
splice(MDX, 1, svg2)
print('wrote statgen-storey-gain.svg')
