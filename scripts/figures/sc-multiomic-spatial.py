import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# For n spots on a line with AR(1) correlation rho, the variance of the mean is inflated by
# 1 + (2/n) sum_{k=1}^{n-1} (n-k) rho^k, converging to (1+rho)/(1-rho). Every value is
# recomputed in src/lib/deepDiveExamples.test.ts.
def de(n, rho):
    return 1 + (2.0 / n) * sum((n - k) * rho ** k for k in range(1, n))

limit = lambda r: (1 + r) / (1 - r)
NS = [10, 50, 200, 2000]
ROWS = [0.2, 0.5, 0.8, 0.9]

ax = Axes(112.0, 400.0, 44.0, 232.0, (0.0, 0.95), (1.0, 40.0), ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([1, 2, 5, 10, 20, 40], ['1', '2', '5', '10', '20', '40'], size=10))
o.append(ax.xticks([0, 0.2, 0.4, 0.6, 0.8], ['0', '0.2', '0.4', '0.6', '0.8']))

o.append(ax.curve(limit, n=220, width=2.4, stroke=ACCENT))
for n, op in ((200, '.6'), (50, '.42'), (10, '.28')):
    o.append(ax.curve(lambda r, nn=n: de(nn, r), n=90, width=1.9, stroke='currentColor',
                      opacity=op))

for rho in ROWS:
    o.append(circle(ax.px(rho), ax.py(limit(rho)), 4.0, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(1.0) + 40,
              'Correlation between neighbouring spots', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Variance inflation of a mean', 11, opacity='.8'))

LX = ax.x1 + 30
o.append(text(LX, 52, 'field size', 9.5, opacity='.6'))
for i, (lab, col, op) in enumerate((('very large', ACCENT, None),
                                    ('200 spots', 'currentColor', '.6'),
                                    ('50 spots', 'currentColor', '.42'),
                                    ('10 spots', 'currentColor', '.28'))):
    yy = 70 + 15 * i
    o.append(line(LX, yy - 4, LX + 20, yy - 4, 2.4 if op is None else 1.9,
                  stroke=col, opacity=op))
    o.append(text(LX + 28, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if op is None else None))

o.append(text(LX, 150, 'limit = (1+r)/(1-r)', 10, opacity='.75'))
for i, (r, v) in enumerate(zip(ROWS, ['1.50', '3.00', '9.00', '19.00'])):
    o.append(text(LX, 168 + 15 * i, 'r = %.1f' % r, 10, opacity='.8'))
    o.append(text(LX + 92, 168 + 15 * i, v, 10, anchor='end', fill=ACCENT, weight='600'))

o.append(text(LX, 244, 'The spine, once more.', 11, weight='700'))
for i, t in enumerate(['Neighbouring spots are', 'correlated for the same reason',
                       'cells from one donor are, and', 'the cost is the same shape.',
                       '', 'At r = 0.5 two thousand spots', 'are worth 667 independent',
                       'ones. The field can be made', 'larger; the correlation',
                       'does not care.']):
    o.append(text(LX, 262 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-spatial-design-effect.svg'), svg(772, 400, ''.join(o)))
print('wrote sc-spatial-design-effect.svg')
