import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: the regression, and what each of its two numbers absorbs ────────
# The worked example's data: E[chi2] = 1.05 + (N h^2 / M) * ell, with N = 100,000,
# M = 1,000,000 and h^2 = 0.25, so the slope is exactly 0.025.
N, M, H2, INTERCEPT = 100000, 1000000, 0.25, 1.05
SLOPE = N * H2 / M
LD = [10, 30, 50, 80, 120, 200]
CHI = [INTERCEPT + SLOPE * l for l in LD]

ax = Axes(94.0, 430.0, 46.0, 246.0, (0.0, 220.0), (0.0, 6.8))
o = [ax.frame()]
o.append(ax.ygrid([0, 1, 2, 3, 4, 5, 6], ['0', '1', '2', '3', '4', '5', '6']))
o.append(ax.xticks([0, 50, 100, 150, 200], ['0', '50', '100', '150', '200']))

# the fitted line, extended back to the axis so the intercept is visible as a height
o.append(line(ax.px(0), ax.py(INTERCEPT), ax.px(220), ax.py(INTERCEPT + SLOPE * 220),
              2, stroke=ACCENT))
for l, c in zip(LD, CHI):
    o.append(circle(ax.px(l), ax.py(c), 4.5, fill=ACCENT))

# what a clean analysis would look like: intercept exactly 1
o.append(line(ax.px(0), ax.py(1.0), ax.px(220), ax.py(1.0), 1.2, opacity='.4', dash='4 3'))
o.append(text(ax.x1 - 6, ax.py(1.0) - 8, 'χ² = 1, the null expectation', 10, anchor='end',
              opacity='.7'))

# the intercept, as a bracket on the axis
o.append(line(ax.px(6), ax.py(0), ax.px(6), ax.py(INTERCEPT), 2, opacity='.85'))
for y in (0.0, INTERCEPT):
    o.append(line(ax.px(6) - 5, ax.py(y), ax.px(6) + 5, ax.py(y), 2, opacity='.85'))
o.append(text(ax.px(14), ax.py(0.62), 'intercept = 1.05', 10.5, weight='600'))
o.append(text(ax.px(14), ax.py(0.30), 'confounding only', 10, opacity='.8'))

# the slope, as a rise over a run
o.append(line(ax.px(120), ax.py(CHI[4]), ax.px(200), ax.py(CHI[4]), 1.4, opacity='.55', dash='3 3'))
o.append(line(ax.px(200), ax.py(CHI[4]), ax.px(200), ax.py(CHI[5]), 1.4, opacity='.55', dash='3 3'))
o.append(text(ax.px(146), ax.py(CHI[4]) - 8, 'run = 80', 10, opacity='.8'))
o.append(text(ax.px(197), ax.py((CHI[4] + CHI[5]) / 2), 'rise = 2.00', 10, anchor='end',
              opacity='.8'))

LX = ax.x1 + 14
o.append(text(LX, 74, 'slope = N h²/M', 11, weight='700', fill=ACCENT))
for i2, t in enumerate(['= 2.00 / 80 = 0.025', 'so h² = 0.025 × M/N', '     = 0.2500']):
    o.append(text(LX, 90 + 13 * i2, t, 10, opacity='.85'))
o.append(text(LX, 148, 'λ_GC on this data', 11, weight='700'))
for i2, t in enumerate(['would read 5.8799 —', 'catastrophic inflation.', 'The intercept says 1.05.',
                        '', 'Only 2.4% of the excess', 'is confounding; the rest', 'is real polygenic signal.']):
    o.append(text(LX, 164 + 13 * i2, t, 10, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 288, 'LD score ℓⱼ (how much of the genome variant j tags)', 12,
              anchor='middle'))
o.append(text(20, 146, 'Expected χ²', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 146)"'))
o.append(text(20, 22, 'One line, two numbers: the slope is heritability, the intercept is everything else',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-ldsc-sldsc-regression.svg'),
                           svg(640, 302, ''.join(o))))
print('  slope %.6f  h2 %.6f  rise %.4f over run 80' % (SLOPE, SLOPE * M / N, CHI[5] - CHI[4]))

# ── Figure 2: partitioned heritability, where enrichment is and is not ────────
# A genuine partition: both columns sum to 1, so the picture reads as a decomposition
# rather than as a set of overlapping annotations. Illustrative proportions in the shape the
# literature reports, not a transcription of any one published analysis — the real baseline
# model's annotations overlap and its shares do not sum to one.
CATS = [('conserved, non-coding', 0.025, 0.20),
        ('coding', 0.011, 0.08),
        ('promoter', 0.018, 0.08),
        ('enhancer', 0.076, 0.24),
        ('intronic', 0.390, 0.25),
        ('intergenic', 0.480, 0.15)]

ax2 = Axes(190.0, 452.0, 50.0, 244.0, (0.0, 9.5), (-0.6, 5.6))
p2 = [ax2.frame()]
p2.append(ax2.xticks([0, 2, 4, 6, 8], ['0', '2', '4', '6', '8']))
p2.append(line(ax2.px(1), ax2.py(-0.6), ax2.px(1), ax2.py(5.6), 1.4, opacity='.5', dash='4 3'))
p2.append(text(ax2.px(1) + 6, ax2.py(5.35), 'no enrichment', 10, opacity='.7'))

for k, (name, pSnp, pH2) in enumerate(CATS):
    e = pH2 / pSnp
    y = ax2.py(5 - k)
    p2.append(text(ax2.x0 - 12, y + 4, '%s  (%.1f%%)' % (name, 100 * pSnp), 10.5,
                   anchor='end'))
    p2.append(rect(ax2.px(0), y - 8, max(1.0, ax2.px(e) - ax2.px(0)), 16,
                   fill=ACCENT if e > 1 else 'currentColor', opacity=None if e > 1 else '.45'))
    p2.append(text(ax2.px(e) + 7, y + 4, '%.1f×' % e, 10, weight='600'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 286,
               'Enrichment: share of heritability ÷ share of variants', 12, anchor='middle'))
p2.append(text(20, 22,
               'Where the heritability actually is: a few percent of the genome carries most of it',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-ldsc-sldsc-partition.svg'),
                           svg(640, 300, ''.join(p2))))
for name, pSnp, pH2 in CATS:
    print('   %-20s %.3f of SNPs, %.2f of h2 -> %.4f x' % (name, pSnp, pH2, pH2 / pSnp))
print('   h2 shares sum to %.4f, SNP shares to %.4f'
      % (sum(h for _, _, h in CATS), sum(s for _, s, _ in CATS)))
