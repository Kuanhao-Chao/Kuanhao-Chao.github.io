import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# The locus the worked example uses throughout: a = 10, d = 4, p(A) = 0.6.
P, A, D = 0.6, 10.0, 4.0
Q = 1 - P
M = A * (P - Q) + 2 * P * Q * D            # 3.92
ALPHA = A + D * (Q - P)                    # 9.2
FREQ = {2: P * P, 1: 2 * P * Q, 0: Q * Q}
GVAL = {2: A, 1: D, 0: -A}
BV = {2: 2 * Q * ALPHA, 1: (Q - P) * ALPHA, 0: -2 * P * ALPHA}

# ── Figure 1: Fisher's regression, which is the definition of the average effect ──
ax = Axes(96.0, 430.0, 46.0, 244.0, (-0.35, 2.35), (-13.5, 13.5))
o = [ax.frame()]
o.append(ax.ygrid([-10, -5, 0, 5, 10], ['-10', '-5', '0', '5', '10']))
o.append(ax.xticks([0, 1, 2], ['0  (aa)', '1  (Aa)', '2  (AA)']))

# the least-squares line through the genotypic values, weighted by genotype frequency
fit = lambda x: M + ALPHA * (x - 2 * P)
o.append(line(ax.px(-0.3), ax.py(fit(-0.3)), ax.px(2.3), ax.py(fit(2.3)), 2, stroke=ACCENT))

# the population mean, at the mean allele count
o.append(line(ax.px(-0.35), ax.py(M), ax.px(2.35), ax.py(M), 1, opacity='.3', dash='3 3'))
o.append(text(ax.px(-0.31), ax.py(M) - 7, 'population mean M = 3.92', 10, opacity='.75'))

for g in (0, 1, 2):
    x, y, yhat = ax.px(g), ax.py(GVAL[g]), ax.py(fit(g))
    # the residual from the line IS the dominance deviation
    o.append(line(x, y, x, yhat, 1.6, dash='4 3', opacity='.8'))
    o.append(circle(x, yhat, 4, fill=ACCENT, opacity='.55'))
    o.append(circle(x, y, 5.5, fill='currentColor'))
    # 'd' is already the dominance parameter in this figure; the residuals are D_i in the prose
    o.append(text(x + 10, (y + yhat) / 2 + 4, 'D = %+.2f' % (GVAL[g] - fit(g)), 10,
                  opacity='.85'))

LX = ax.x1 + 14
o.append(text(LX, 74, 'slope = α = 9.20', 11, weight='700', fill=ACCENT))
o.append(text(LX, 92, 'genotypic value G', 11, weight='700'))
for i, t in enumerate(['AA  +10', 'Aa    +4', 'aa   −10']):
    o.append(text(LX, 108 + 14 * i, t, 10, opacity='.8'))
o.append(text(LX, 168, 'breeding value', 11, weight='700'))
for i, t in enumerate(['= fitted value − M', 'AA  +7.36', 'Aa   −1.84', 'aa  −11.04']):
    o.append(text(LX, 184 + 14 * i, t, 10, opacity='.8'))
o.append(text(LX, 250, 'dominance deviation', 11, weight='700'))
for i, t in enumerate(['= residual from the line', 'AA  −1.28', 'Aa   +1.92', 'aa   −2.88']):
    o.append(text(LX, 266 + 14 * i, t, 10, opacity='.8'))

o.append(text((ax.x0 + ax.x1) / 2, 288, 'Copies of allele A', 12, anchor='middle'))
o.append(text(20, 145, 'Genotypic value', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 145)"'))
o.append(text(20, 22, 'The average effect is a regression slope, and dominance is what it leaves behind',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-quantitative-genetics-selection-regression.svg'),
                           svg(640, 336, ''.join(o))))
print('  M %.4f  alpha %.4f  BV %s' % (M, ALPHA, {k: round(v, 4) for k, v in BV.items()}))
print('  dominance deviations %s' % {g: round(GVAL[g] - fit(g), 4) for g in (0, 1, 2)})

# ── Figure 2: the variances are properties of the population, not of the locus ──
va = lambda p: 2 * p * (1 - p) * (A + D * (1 - 2 * p)) ** 2
vd = lambda p: (2 * p * (1 - p) * D) ** 2

ax2 = Axes(96.0, 452.0, 46.0, 244.0, (0.0, 1.0), (0.0, 60.0))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([0, 15, 30, 45, 60], ['0', '15', '30', '45', '60']))
p2.append(ax2.xticks([0, 0.2, 0.4, 0.6, 0.8, 1.0], ['0', '0.2', '0.4', '0.6', '0.8', '1.0']))
p2.append(ax2.curve(va, n=240, width=2, stroke=ACCENT))
p2.append(ax2.curve(vd, n=240, width=2, dash='5 3'))

p2.append(line(ax2.px(P), ax2.py(0), ax2.px(P), ax2.py(60), 1, opacity='.35', dash='3 3'))
p2.append(circle(ax2.px(P), ax2.py(va(P)), 4.5, fill=ACCENT))
p2.append(circle(ax2.px(P), ax2.py(vd(P)), 4, fill='currentColor'))

LX = ax2.x1 + 14
p2.append(text(LX, 84, 'V_A', 11, weight='700', fill=ACCENT))
p2.append(text(LX, 100, 'vanishes at both', 10, opacity='.8'))
p2.append(text(LX, 113, 'fixation points', 10, opacity='.8'))
p2.append(text(LX, 144, 'V_D', 11, weight='700'))
p2.append(text(LX, 160, 'peaks at p = 0.5 and', 10, opacity='.8'))
p2.append(text(LX, 173, 'is small throughout', 10, opacity='.8'))
p2.append(text(LX, 204, 'at p = 0.6:', 11, weight='700'))
p2.append(text(LX, 220, 'V_A = 40.6272', 10, opacity='.8'))
p2.append(text(LX, 233, 'V_D = 3.6864', 10, opacity='.8'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 288, 'Frequency of allele A', 12, anchor='middle'))
p2.append(text(20, 145, 'Variance contributed by the locus', 11.5, anchor='middle',
               extra='transform="rotate(-90 20 145)"'))
p2.append(text(20, 22, 'One locus, unchanged: the variance it contributes depends on the population',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-quantitative-genetics-selection-variance.svg'),
                           svg(640, 302, ''.join(p2))))
print('  V_A(0.6) %.4f  V_D(0.6) %.4f  V_A max %.4f at p=%.3f'
      % (va(P), vd(P), max(va(i / 1000) for i in range(1001)),
         max(range(1001), key=lambda i: va(i / 1000)) / 1000))
