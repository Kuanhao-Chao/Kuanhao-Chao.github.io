import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── What genomic control costs a real locus ──────────────────────────────────
# A study with lambda_GC = 1.18 whose LDSC intercept is 1.02 has almost no confounding:
# dividing every statistic by lambda removes 15.25% where only 1.96% is warranted. There
# is a band of genuinely significant loci that survives the correct correction and does
# not survive genomic control. Every value is asserted in deepDiveExamples.test.ts.
THRESH = 29.7168
LAM, INT = 1.18, 1.02
LO, HI = THRESH * INT, THRESH * LAM     # 30.3111 .. 35.0658

ax = Axes(96.0, 470.0, 92.0, 196.0, (26.0, 42.0), (0.0, 1.0))
o = [line(ax.x0, ax.y1, ax.x1, ax.y1, 1.25)]
o.append(ax.xticks([28, 30, 32, 34, 36, 38, 40],
                   ['28', '30', '32', '34', '36', '38', '40']))

# the band GC destroys and the intercept keeps
o.append(rect(ax.px(LO), 92.0, ax.px(HI) - ax.px(LO), 104.0, opacity='0.16',
              fill='currentColor', rx=2))
# y grows downward, so the first line of the caption needs the smaller y.
o.append(text((ax.px(LO) + ax.px(HI)) / 2, 70.0, 'lost to genomic control,', 10,
              anchor='middle', weight='600'))
o.append(text((ax.px(LO) + ax.px(HI)) / 2, 84.0, 'kept by the intercept', 10,
              anchor='middle', opacity='.7'))

o.append(line(ax.px(THRESH), 92.0, ax.px(THRESH), 196.0, 1.6, opacity='.7', dash='5 4'))
o.append(text(ax.px(THRESH), 236.0, 'threshold 29.72', 9.5, anchor='middle', opacity='.75'))

# One locus, and where each correction sends it. Both arrows sit well above the axis:
# at y1 - 6 the second one drew straight through the tick marks.
C = 33.0
o.append(circle(ax.px(C), 116.0, 5.5, fill=ACCENT))
o.append(text(ax.px(C) + 10, 120.0, 'a real locus at 33', 9.5, fill=ACCENT, weight='600'))
for target, lab, y in ((C / INT, 'intercept: 32.35', 146.0), (C / LAM, 'GC: 27.97', 174.0)):
    o.append(path([(ax.px(C), y), (ax.px(target), y)], width=1.4, opacity='.6', dash='3 3'))
    o.append(circle(ax.px(target), y, 3.6, fill='currentColor', opacity='.7'))
    o.append(text(ax.px(target) - 8, y + 4, lab, 9.5, anchor='end', opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 262.0, 'Association statistic (chi-square, 1 df)', 12,
              anchor='middle'))
o.append(text(20, 24, 'Genomic control removes 15.25% of every statistic; only 1.96% is earned',
              11.5, opacity='.8'))
o.append(text(20, 292, 'The shaded band runs from 30.31 to 35.07 — every locus in it is genuinely',
              10, opacity='.85'))
o.append(text(20, 306, 'significant, survives dividing by the 1.02 intercept, and is destroyed by',
              10, opacity='.85'))
o.append(text(20, 320, 'dividing by the 1.18 lambda.', 10, opacity='.85'))

print('bytes:', write(os.path.join(OUT, 'gwas-population-structure-gc-cost.svg'),
                      svg(640, 336, ''.join(o))))
print('  band %.4f .. %.4f  width %.4f' % (LO, HI, HI - LO))
print('  locus 33 -> GC %.4f (lost), intercept %.4f (kept)' % (C / LAM, C / INT))
print('  GC removes %.2f%%, intercept removes %.2f%%' % (100 * (1 - 1 / LAM), 100 * (1 - 1 / INT)))
