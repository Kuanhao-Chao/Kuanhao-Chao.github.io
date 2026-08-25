import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

def ppmf(k, mu):
    return math.exp(-mu + k * math.log(mu) - math.lgamma(k + 1)) if mu > 0 else (1.0 if k == 0 else 0.0)

def sd_of(f, mu, kmax=400):
    m = sum(ppmf(k, mu) * f(k) for k in range(kmax))
    v = sum(ppmf(k, mu) * (f(k) - m) ** 2 for k in range(kmax))
    return math.sqrt(max(v, 0.0))

# ── 1 · What each transform does to the variance it claims to stabilise ──────
# A transform is variance-stabilising if the sd of the transformed count is flat in the mean.
# Pearson residuals are flat at 1 by construction. Anscombe reaches 1 above a mean of about
# five. log1p -- the field's default -- is the least flat of the three, running 5.14x across
# the range, and it is worst exactly where single-cell counts live.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
TRANSFORMS = (
    ('Pearson residual', lambda k, mu: 0.0, None, ACCENT),
    ('Anscombe', lambda k, mu: 2 * math.sqrt(k + 0.375), None, 'currentColor'),
    ('sqrt', lambda k, mu: math.sqrt(k), '.62', 'currentColor'),
    ('log1p', lambda k, mu: math.log1p(k), None, 'currentColor'),
)

ax = Axes(112.0, 424.0, 44.0, 232.0, (0.05, 200.0), (0.0, 1.2), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1.00'],
                  emphasise=(1.0,)))
o.append(ax.xticks([0.1, 1, 10, 100], ['0.1', '1', '10', '100']))

o.append(ax.curve(lambda mu: sd_of(lambda k: 2 * math.sqrt(k + 0.375), mu), n=90,
                  width=2.0, stroke='currentColor', opacity='.7'))
o.append(ax.curve(lambda mu: sd_of(math.sqrt, mu), n=90, width=2.0,
                  stroke='currentColor', opacity='.42'))
o.append(ax.curve(lambda mu: sd_of(math.log1p, mu), n=90, width=2.4, stroke=ACCENT))
o.append(line(ax.x0, ax.py(1.0), ax.x1, ax.py(1.0), 2.0, opacity='.85', dash='6 4'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Mean UMIs per cell', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'SD of the transformed count', 11, opacity='.8'))

LX = ax.x1 + 26
for i, (lab, col, op, dash) in enumerate((('Pearson residual', 'currentColor', '.85', '6 4'),
                                          ('Anscombe', 'currentColor', '.7', None),
                                          ('sqrt', 'currentColor', '.42', None),
                                          ('log1p', ACCENT, None, None))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op, dash=dash))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 138, 'log1p is the least flat.', 11, weight='700'))
for i, t in enumerate(['A flat line is the whole', 'point of a stabilising',
                       'transform. Pearson residuals', 'are flat at 1 by construction',
                       'and Anscombe gets there', 'above a mean of five.', '',
                       'log1p runs from 0.51 down to', '0.10 - a factor of 5.14 - so',
                       'the same biological change', 'reads as different evidence',
                       'depending on the gene.']):
    o.append(text(LX, 156 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-variance-stabilisation.svg'), svg(760, 318, ''.join(o)))

# ── 2 · Normalisation rescales; it cannot un-fail an observation ─────────────
# Two cells of the same type differing only in depth do not differ in normalised
# expression -- but they differ enormously in whether the gene is seen at all, and no
# division repairs a zero.
o = []
ax = Axes(112.0, 424.0, 44.0, 232.0, (500.0, 50000.0), (0.0, 100.0), xlog=True)
o.append(ax.frame())
o.append(ax.ygrid([0, 25, 50, 75, 100], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([1000, 10000, 50000], ['1,000', '10,000', '50,000']))
for prop, op in ((5e-5, None), (2e-4, '.66'), (1e-3, '.42')):
    o.append(ax.curve(lambda d, p=prop: 100 * (1 - math.exp(-d * p)), n=200, width=2.1,
                      stroke=ACCENT if prop == 5e-5 else 'currentColor', opacity=op))

for d, lab in ((2000, '9.5%'), (20000, '63.2%')):
    y = 100 * (1 - math.exp(-d * 5e-5))
    o.append(line(ax.px(d), ax.py(0.0), ax.px(d), ax.py(y), 1.1, opacity='.3', dash='3 3'))
    o.append(circle(ax.px(d), ax.py(y), 4.2, fill=ACCENT))
    o.append(text(ax.px(d) + 9, ax.py(y) + 16, lab, 10.5, fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Sequencing depth of the cell', 12,
              anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Cells detecting the gene', 11, opacity='.8'))

LX = ax.x1 + 26
for i, (lab, col, op) in enumerate((('1 in 1,000', 'currentColor', '.42'),
                                    ('2 in 10,000', 'currentColor', '.66'),
                                    ('5 in 100,000', ACCENT, None))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 128, 'Depth decides detection.', 11, weight='700'))
for i, t in enumerate(['Every curve here is one true', 'expression level held fixed.',
                       'The only thing changing is', 'how deeply the cell was read.',
                       '', 'Dividing by library size puts', 'the two cells on the same',
                       'scale and leaves one of them', 'at zero, because the molecule',
                       'was never observed.']):
    o.append(text(LX, 146 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-detection-depth.svg'), svg(748, 306, ''.join(o)))
print('wrote sc-variance-stabilisation.svg, sc-detection-depth.svg')
