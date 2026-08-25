import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── What an INFO filter costs in power ───────────────────────────────────────
# Imputation quality multiplies the effective sample size, so the smallest detectable
# q2 is 39.600989/(N_eff * INFO) — a hyperbola in INFO. The point of the figure is that
# the curve is flat where people worry about it and vertical where they do not.
# Every label is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
NEFF = 32000.0
K = 39.600989
q2 = lambda info: K / (NEFF * info)

ax = Axes(96.0, 420.0, 44.0, 228.0, (0.2, 1.0), (0.0, 0.0070))
o = [ax.frame()]
# `emphasise` only marks a value that is also a tick, and the floor is not one — so it is
# drawn explicitly below rather than passed here, where it would silently do nothing.
o.append(ax.ygrid([0.0, 0.002, 0.004, 0.006], ['0', '0.002', '0.004', '0.006']))
o.append(ax.xticks([0.2, 0.4, 0.6, 0.8, 1.0], ['0.2', '0.4', '0.6', '0.8', '1.0']))
o.append(ax.curve(q2, n=240, width=2.2, stroke=ACCENT))

# the conventional INFO > 0.3 filter, and two variants either side of it
o.append(line(ax.px(0.3), ax.py(0.0), ax.px(0.3), ax.py(0.0070), 1.3, opacity='.5', dash='5 4'))
o.append(text(ax.px(0.3) + 6, 60, 'the usual filter, INFO > 0.3', 10, opacity='.75'))
# The 0.32 marker sits on the filter line, so its label goes to the right instead of above.
for info, lab, anchor, dx, dy in ((0.95, '0.0013', 'middle', 0, -12),
                                  (0.55, '0.0023', 'middle', 0, -12),
                                  (0.32, '0.0039', 'start', 9, -6)):
    o.append(circle(ax.px(info), ax.py(q2(info)), 4.5, fill=ACCENT))
    o.append(text(ax.px(info) + dx, ax.py(q2(info)) + dy, lab, 10, anchor=anchor, fill=ACCENT,
                  weight='600'))

o.append(line(ax.x0, ax.py(q2(1.0)), ax.x1, ax.py(q2(1.0)), 1.2, opacity='.35', dash='4 4'))

o.append(text(ax.x1 - 4, ax.py(q2(1.0)) + 15, 'floor at perfect calling: 0.0012', 10,
              anchor='end', opacity='.75'))
o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Imputation quality (INFO)', 12,
              anchor='middle'))
o.append(text(ax.x0 - 74, 26, 'Smallest detectable q²', 11, opacity='.8'))

LX = ax.x1 + 24
o.append(text(LX, 62, 'Quality multiplies', 11, weight='700'))
o.append(text(LX, 77, 'the sample.', 11, weight='700'))
for i, t in enumerate(['A variant at INFO 0.32', 'in 32,000 effective',
                       'samples carries the', 'information of 10,240.']):
    o.append(text(LX, 97 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 168, 'So the filter is a', 11, weight='700'))
o.append(text(LX, 183, 'power decision.', 11, weight='700'))
for i, t in enumerate(['At the 0.3 threshold a', 'study needs 3.33x the',
                       'variance explained, or', '1.83x the per-allele',
                       'effect, that perfect', 'calling would need.']):
    o.append(text(LX, 203 + 13 * i, t, 10, opacity='.8'))

print('bytes:', write(os.path.join(OUT, 'gwas-arrays-imputation-info-power.svg'),
                      svg(640, 288, ''.join(o))))
for i in (1.0, 0.95, 0.55, 0.32, 0.30):
    print('  INFO %.2f -> N_eff %8.0f  min q2 %.6f' % (i, NEFF * i, q2(i)))
print('  cost at the 0.3 filter: %.4fx' % (q2(0.3) / q2(1.0)))
