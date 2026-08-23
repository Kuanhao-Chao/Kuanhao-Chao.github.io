import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── The distance between discovery and prediction ────────────────────────────
# The hub's worked example, drawn. One common variant (MAF 0.30, beta 0.05) explains
# q2 = 1.05e-3 of a trait with h2 = 0.30. Module 4 finds it at N = 37,716. Module 5 then
# shows that the *whole* genome-wide score built at that N explains 0.34% — and that
# closing the remaining gap to h2 costs three orders of magnitude more people.
# Every number here is recomputed and asserted in src/lib/deepDiveExamples.test.ts.
H2, M = 0.30, 1.0e6
r2 = lambda n: H2 * (n * H2) / (n * H2 + M)

N_DISC = 37716        # ceil(39.5988.../q2), the discovery sample from Module 4
N_HALF = 3333334      # sampleSizeForR2(0.15, M, h2)
N_90 = 30000001       # sampleSizeForR2(0.27, M, h2)

ax = Axes(96.0, 430.0, 44.0, 236.0, (1.0e4, 1.0e8), (0.0, 0.325), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0.0, 0.10, 0.20, 0.30], ['0', '10%', '20%', '30%'], emphasise=(0.30,)))
o.append(ax.xticks([1e4, 1e5, 1e6, 1e7, 1e8],
                   ['10⁴', '10⁵', '10⁶', '10⁷', '10⁸']))
o.append(ax.curve(r2, n=240, width=2.2, stroke=ACCENT))
o.append(text(ax.x1 - 4, ax.py(0.30) - 9, 'ceiling: h² = 30%', 10.5,
              anchor='end', opacity='.75'))

for n, lab, dy in ((N_DISC, '0.34%', -14), (N_HALF, '15%', -14), (N_90, '27%', -14)):
    o.append(line(ax.px(n), ax.py(0.0), ax.px(n), ax.py(r2(n)), 1.1, opacity='.35', dash='3 3'))
    o.append(circle(ax.px(n), ax.py(r2(n)), 4.5, fill=ACCENT))
    o.append(text(ax.px(n), ax.py(r2(n)) + dy, lab, 10, anchor='middle', fill=ACCENT,
                  weight='600'))
o.append(text(ax.px(N_DISC), ax.py(0.0) + 18, '37,716', 9.5, anchor='middle', opacity='.75'))
o.append(text(ax.px(N_HALF), ax.py(0.0) + 18, '3.3M', 9.5, anchor='middle', opacity='.75'))
o.append(text(ax.px(N_90), ax.py(0.0) + 18, '30M', 9.5, anchor='middle', opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40, 'GWAS sample size N', 12, anchor='middle'))
o.append(text(ax.x0 - 74, 26, 'Variance of the trait the score explains', 11, opacity='.8'))

# Right-hand margin column — annotation never goes inside the plot.
LX = ax.x1 + 22
o.append(text(LX, 60, 'The same variant,', 11, weight='700'))
o.append(text(LX, 75, 'twice over:', 11, weight='700'))
for i, t in enumerate(['found at N = 37,716,', 'where it is a genome-wide', 'hit worth reporting —',
                       'and where the entire', 'score predicts 0.34% of', 'the trait.']):
    o.append(text(LX, 95 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 188, 'Half the ceiling costs', 11, weight='700'))
o.append(text(LX, 203, '88x more people. Nine', 10, opacity='.8'))
o.append(text(LX, 216, 'tenths of it costs 795x,', 10, opacity='.8'))
o.append(text(LX, 229, 'and the last tenth is', 10, opacity='.8'))
o.append(text(LX, 242, 'unreachable.', 10, opacity='.8'))

print('bytes:', write(os.path.join(OUT, 'statistical-genetics-discovery-prediction.svg'),
                      svg(640, 296, ''.join(o))))
print('  R2 at N_DISC %.6f  N_HALF %.4f  N_90 %.4f' % (r2(N_DISC), r2(N_HALF), r2(N_90)))
print('  multiples: %.1fx %.1fx' % (N_HALF / N_DISC, N_90 / N_DISC))
