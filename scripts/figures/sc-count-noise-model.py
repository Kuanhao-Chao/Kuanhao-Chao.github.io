import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

pz = lambda mu: math.exp(-mu)
nz = lambda mu, th: (th / (th + mu)) ** th

# ── 1 · Where the zeros come from ────────────────────────────────────────────
# P(count = 0) against the gene's mean, under Poisson sampling and under two negative
# binomials. At the means most genes actually have, the three curves are on top of each
# other: the zeros are sampling, not a separate dropout process. They only separate where
# the mean is high, and a gene with a high mean has few zeros to argue about.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
ax = Axes(104.0, 424.0, 44.0, 232.0, (0.01, 10.0), (0.0, 100.0), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([0.01, 0.1, 1, 10], ['0.01', '0.1', '1', '10']))

o.append(ax.curve(lambda m: 100 * nz(m, 0.5), n=260, width=2.0, stroke='currentColor',
                  opacity='.45'))
o.append(ax.curve(lambda m: 100 * nz(m, 2.0), n=260, width=2.0, stroke='currentColor',
                  opacity='.7'))
o.append(ax.curve(lambda m: 100 * pz(m), n=260, width=2.3, stroke=ACCENT))

# the regime nearly every gene lives in, bracketed along the empty bottom-left
o.append(line(ax.px(0.01), ax.py(6.0), ax.px(1.0), ax.py(6.0), 1.4, opacity='.4'))
o.append(text(ax.px(0.1), ax.py(10.5), 'where most genes sit', 10, anchor='middle',
              opacity='.75'))

o.append(line(ax.px(0.1), ax.py(0.0), ax.px(0.1), ax.py(100 * pz(0.1)), 1.1, opacity='.3',
              dash='3 3'))
o.append(circle(ax.px(0.1), ax.py(100 * pz(0.1)), 4.2, fill=ACCENT))
o.append(text(ax.px(0.1) - 10, ax.py(100 * pz(0.1)) + 17, '90.5% at a mean of 0.1', 10.5,
              anchor='end', fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Mean UMIs per cell', 12, anchor='middle'))
o.append(text(ax.x0 - 82, 26, 'Cells with zero count', 11, opacity='.8'))

# The three curves are named in the margin rather than inline: they converge over most of
# the domain, so any inline label sits on top of at least one of the others.
LX = ax.x1 + 30
for i, (lab, col, op) in enumerate((('Poisson', ACCENT, None),
                                    ('NB, theta 2', 'currentColor', '.7'),
                                    ('NB, theta 0.5', 'currentColor', '.45'))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 128, 'Zeros are sampling.', 11, weight='700'))
for i, t in enumerate(['Below a mean of about 1,', 'the three curves are the',
                       'same curve: whatever the', 'dispersion, the zeros are',
                       'what counting produces.', '',
                       'They separate only where', 'the mean is high - and a',
                       'gene with a high mean has', 'almost no zeros left to',
                       'attribute to anything.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-zero-sources.svg'), svg(720, 306, ''.join(o)))

# ── 2 · The mean-variance trend, which is what actually identifies the model ──
# Poisson forces variance = mean, a slope-1 line on log-log. Real genes sit above it, and
# the gap is mu^2/theta -- quadratic, so it is invisible at low mean and dominant at high.
o = []
ax = Axes(112.0, 424.0, 44.0, 232.0, (0.01, 100.0), (1e-3, 1e5), xlog=True, ylog=True)
o.append(ax.frame())
o.append(ax.ygrid([1e-3, 1e-1, 1e1, 1e3, 1e5],
                  ['0.001', '0.1', '10', '1,000', '100,000'], size=10))
o.append(ax.xticks([0.01, 0.1, 1, 10, 100], ['0.01', '0.1', '1', '10', '100']))
o.append(ax.curve(lambda m: m + m * m / 0.5, n=260, width=2.0, stroke='currentColor',
                  opacity='.45'))
o.append(ax.curve(lambda m: m + m * m / 2.0, n=260, width=2.0, stroke='currentColor',
                  opacity='.7'))
o.append(ax.curve(lambda m: m, n=260, width=2.3, stroke=ACCENT))
o.append(text(ax.x1 + 6, ax.py(100 + 10000 / 0.5) + 4, 'theta 0.5', 10, opacity='.6'))
o.append(text(ax.x1 + 6, ax.py(100 + 10000 / 2.0) + 4, 'theta 2', 10, opacity='.8'))
o.append(text(ax.x1 + 6, ax.py(100.0) + 4, 'Poisson', 10, fill=ACCENT, weight='600'))

o.append(line(ax.px(0.1), ax.py(1e-3), ax.px(0.1), ax.py(1e5), 1.1, opacity='.28', dash='3 3'))
o.append(text(ax.px(0.1), ax.py(1e5) - 8, 'mean 0.1: the NB sits 5% above Poisson', 10,
              anchor='middle', opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(1e-3) + 40, 'Mean UMIs per cell', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Variance', 11, opacity='.8'))

LX = ax.x1 + 62
o.append(text(LX, 62, 'The excess is quadratic.', 11, weight='700'))
for i, t in enumerate(['Variance is mu + mu squared', 'over theta. The second term',
                       'is negligible at low mean and', 'dominant at high, so the',
                       'trend identifies theta only', 'from the well-expressed genes.',
                       '', 'This is also why a variance-', 'stabilising transform has to',
                       'know the trend before it can', 'undo it.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-mean-variance.svg'), svg(784, 300, ''.join(o)))
print('wrote sc-zero-sources.svg, sc-mean-variance.svg')
