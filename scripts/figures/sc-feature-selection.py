import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

def ppmf(k, mu):
    return math.exp(-mu + k * math.log(mu) - math.lgamma(k + 1))

def log1p_var(mu):
    kmax = max(40, int(mu + 12 * math.sqrt(mu)) + 1)
    m = sum(ppmf(k, mu) * math.log1p(k) for k in range(kmax))
    return sum(ppmf(k, mu) * (math.log1p(k) - m) ** 2 for k in range(kmax))

# ── How three selection criteria rank genes that are statistically identical ──
# Every gene here is pure Poisson: no biological variance whatever. Plotted is each
# criterion's verdict *relative to a reference gene at mean 2*, so the y-axis reads "how many
# times more variable does this criterion think this gene is". Raw variance rises without
# bound; log1p variance peaks near a mean of 1.72 and collapses; only a trend residual is
# flat, which is the correct answer for genes with no excess variance.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
REF = 2.0
raw = lambda mu: mu / REF
lg = lambda mu: log1p_var(mu) / log1p_var(REF)

ax = Axes(120.0, 424.0, 44.0, 232.0, (0.1, 1000.0), (0.001, 1000.0), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([0.001, 0.01, 0.1, 1, 10, 100, 1000],
                  ['0.001', '0.01', '0.1', '1', '10', '100', '1,000'], size=10,
                  emphasise=(1,)))
o.append(ax.xticks([0.1, 1, 10, 100, 1000], ['0.1', '1', '10', '100', '1,000']))

o.append(ax.curve(raw, n=200, width=2.2, stroke='currentColor', opacity='.72'))
o.append(ax.curve(lg, n=200, width=2.4, stroke=ACCENT))

# the two genes the worked example uses
for mu in (2.0, 100.0):
    o.append(line(ax.px(mu), ax.py(0.001), ax.px(mu), ax.py(1000.0), 1.1, opacity='.25',
                  dash='3 3'))
for mu, lab, col, dy in ((100.0, '50x', 'currentColor', -10),
                         (100.0, '0.038x', ACCENT, 16)):
    v = raw(mu) if col != ACCENT else lg(mu)
    o.append(circle(ax.px(mu), ax.py(v), 4.2, fill=col))
    o.append(text(ax.px(mu) - 9, ax.py(v) + dy, lab, 10.5, anchor='end', fill=col,
                  weight='600'))

o.append(text(ax.px(2.0), ax.py(1000.0) - 8, 'reference gene, mean 2', 10, anchor='middle',
              opacity='.7'))
o.append(text(ax.px(100.0), ax.py(1000.0) - 8, 'mean 100', 10, anchor='middle', opacity='.7'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.001) + 40, 'Mean UMIs per cell', 12,
              anchor='middle'))
o.append(text(ax.x0 - 98, 26, 'Variability, relative to the reference gene', 11, opacity='.8'))

LX = ax.x1 + 26
for i, (lab, col, op) in enumerate((('raw variance', 'currentColor', '.72'),
                                    ('log1p variance', ACCENT, None),
                                    ('trend residual', 'currentColor', '.4'))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op,
                  dash='4 3' if lab == 'trend residual' else None))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 128, 'Opposite orderings.', 11, weight='700'))
for i, t in enumerate(['Neither gene has any', 'biological variance - both are',
                       'pure Poisson. Raw variance', 'still calls the mean-100 gene',
                       '50 times more variable, and', 'log1p variance calls it 26',
                       'times less.', '',
                       'Both are ranking by mean, in', 'opposite directions. Only the',
                       'residual from the fitted', 'mean-variance trend is flat,',
                       'which is the right answer.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

# the correct criterion: flat at 1 (no excess variance anywhere)
o.append(line(ax.x0, ax.py(1.0), ax.x1, ax.py(1.0), 1.8, opacity='.4', dash='4 3'))

write(os.path.join(OUT, 'sc-hvg-criteria.svg'), svg(772, 322, ''.join(o)))
print('wrote sc-hvg-criteria.svg')
