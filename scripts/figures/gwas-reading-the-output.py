import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Why a GWAS keeps FWER ────────────────────────────────────────────────────
# Bonferroni's cutoff does not move: alpha/m, whatever the trait. BH's does — it is
# (k/m)q, so it loosens in proportion to how much signal there is, and the expected number
# of false discoveries loosens with it. Every value is asserted in deepDiveExamples.test.ts.
M, Q, ALPHA = 1.0e6, 0.05, 0.05
bh = lambda k: (k / M) * Q
BONF = ALPHA / M

ax = Axes(104.0, 430.0, 50.0, 226.0, (1.0, 10000.0), (2.0e-8, 4.0e-4), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.xticks([1, 10, 100, 1000, 10000], ['1', '10', '100', '1,000', '10,000']))
o.append(ax.ygrid([5e-8, 1e-6, 1e-5, 1e-4],
                  ['5e-8', '1e-6', '1e-5', '1e-4'], emphasise=(5e-8,)))
o.append(ax.curve(bh, n=200, width=2.2, stroke=ACCENT))
o.append(line(ax.x0, ax.py(BONF), ax.x1, ax.py(BONF), 1.8, opacity='.55', dash='6 4'))
o.append(text(ax.x1 - 4, ax.py(BONF) - 8, 'Bonferroni: 5e-8, whatever the trait', 10,
              anchor='end', opacity='.75'))

# The last marker is at the right edge, so its label goes left or it lands on the
# margin column's heading.
for k, lab, anchor, dx in ((6, '6 hits', 'start', 9), (500, '500 hits', 'start', 9),
                           (5000, '5,000 hits', 'end', -9)):
    o.append(circle(ax.px(k), ax.py(bh(k)), 4.5, fill=ACCENT))
    o.append(text(ax.px(k) + dx, ax.py(bh(k)) + 4, lab, 9.5, anchor=anchor, fill=ACCENT,
                  weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(2.0e-8) + 42, 'Discoveries the scan makes', 12,
              anchor='middle'))
# The curve is the BH *bound* (k/m)q, not the largest p-value a scan rejects. The lesson
# uses "effective threshold" for the latter, so the axis names the former explicitly.
o.append(text(ax.x0 - 80, 26, 'Benjamini-Hochberg bound, (k/m)q', 11, opacity='.8'))

LX = ax.x1 + 22
o.append(text(LX, 60, "BH's threshold", 11, weight='700'))
o.append(text(LX, 75, 'follows the signal.', 11, weight='700'))
for i, t in enumerate(['At 6 discoveries it is', 'barely looser than',
                       'Bonferroni. At 500 it is', '500 times looser, and', '25 of them are',
                       'expected to be false.']):
    o.append(text(LX, 95 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 190, 'A false locus costs', 11, weight='700'))
o.append(text(LX, 205, 'years of follow-up,', 10, opacity='.8'))
o.append(text(LX, 218, 'so the field pays for', 10, opacity='.8'))
o.append(text(LX, 231, 'the stricter rule.', 10, opacity='.8'))

print('bytes:', write(os.path.join(OUT, 'gwas-reading-the-output-fdr.svg'),
                      svg(640, 288, ''.join(o))))
for k in (6, 500, 5000):
    print('  k=%5d  threshold %.2e  = %.0fx Bonferroni  expected false %.1f'
          % (k, bh(k), bh(k) / BONF, Q * k))
