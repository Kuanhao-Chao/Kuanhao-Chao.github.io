import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Controls saturate; cases do not ──────────────────────────────────────────
# N_eff = 4/(1/cases + 1/controls) against the number of controls, at a fixed 10,000
# cases. The curve flattens against 4 x cases, which is the whole design argument: past
# a 4:1 ratio the next control is nearly worthless and the next case is not.
# Every label here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
CASES = 10000
CEILING = 4 * CASES
neff = lambda controls, cases=CASES: 4 / (1 / cases + 1 / controls)

ax = Axes(96.0, 424.0, 44.0, 232.0, (5000.0, 400000.0), (0.0, 44000.0), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0, 10000, 20000, 30000, 40000],
                  ['0', '10k', '20k', '30k', '40k'], emphasise=(40000,)))
o.append(ax.xticks([1e4, 4e4, 1e5, 4e5], ['10k', '40k', '100k', '400k']))
o.append(ax.curve(neff, n=240, width=2.2, stroke=ACCENT))
o.append(text(ax.x1 - 4, ax.py(CEILING) - 9,
              'ceiling: 4 x cases = 40,000', 10.5, anchor='end', opacity='.75'))

# the 4:1 design, and what doubling the controls from there buys
# The ratio rides on the marker label rather than the axis: a separate row at y1+18
# lands exactly on the "40k" and "100k" tick labels and overplots them.
for controls, lab in ((40000, '32,000 at 4:1'), (80000, '35,556 at 8:1')):
    y = neff(controls)
    o.append(line(ax.px(controls), ax.py(0.0), ax.px(controls), ax.py(y), 1.1,
                  opacity='.35', dash='3 3'))
    o.append(circle(ax.px(controls), ax.py(y), 4.5, fill=ACCENT))
    o.append(text(ax.px(controls), ax.py(y) - 13, lab, 10, anchor='middle', fill=ACCENT,
                  weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'Controls, at 10,000 cases', 12,
              anchor='middle'))
o.append(text(ax.x0 - 74, 26, 'Effective sample size', 11, opacity='.8'))

LX = ax.x1 + 22
o.append(text(LX, 62, 'Controls saturate.', 11, weight='700'))
for i, t in enumerate(['At 4:1 the study already', 'holds 80% of everything',
                       'controls can ever buy.', 'Doubling them to 8:1 adds', 'nine points.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 164, 'Cases do not.', 11, weight='700'))
# "sixteen times" needs its baseline named: it is cases against controls for the SAME
# 10,000 people (21,333 vs 1,333), not against the +40,000-controls gain above.
for i, t in enumerate(['Ten thousand more cases', 'lifts the ceiling itself,',
                       'to 53,333 effective — a', 'gain of 21,333 against',
                       'the 1,333 those same', 'ten thousand buy as', 'controls.']):
    o.append(text(LX, 182 + 13 * i, t, 10, opacity='.8'))

print('bytes:', write(os.path.join(OUT, 'gwas-study-design-saturation.svg'),
                      svg(640, 292, ''.join(o))))
print('  N_eff at 4:1 %.1f  at 8:1 %.1f  ceiling %d' % (neff(40000), neff(80000), CEILING))
print('  +10k controls %.1f   +10k cases %.1f' % (neff(50000), neff(40000, 20000)))
print('  gain ratio: %.1fx' % ((neff(40000, 20000) - neff(40000)) / (neff(50000) - neff(40000))))
