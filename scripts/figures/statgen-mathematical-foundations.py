import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, Axes, ACCENT, circle

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: Wald, score and LRT are three readings of one curve ─────────────
# The 2x2 table from the worked example, as a logistic model with the intercept profiled
# out. Everything drawn is computed from that likelihood, so the picture and the arithmetic
# in the prose are the same object.
#
# Drawn on the DEVIANCE scale, 2[l(b) - l(bhat)], which is what makes the three tests
# commensurable: each is a vertical distance on this one plot. The strong-effect table is
# used deliberately — at a small effect all three agree to three digits and the figure
# would show a single curve.
A, B, C, D = 80, 20, 40, 60               # case A / case a / control A / control a

def expit(t):
    return 1 / (1 + math.exp(-t))

def loglik(alpha, beta):
    p1, p0 = expit(alpha + beta), expit(alpha)
    return (A * math.log(p1) + B * math.log(1 - p1)
            + C * math.log(p0) + D * math.log(1 - p0))

def profile(beta):
    """max over the nuisance intercept, by golden-section on a unimodal function."""
    lo, hi = -12.0, 12.0
    gr = (math.sqrt(5) - 1) / 2
    a, b = hi - gr * (hi - lo), lo + gr * (hi - lo)
    for _ in range(200):
        if loglik(a, beta) < loglik(b, beta):
            lo = a
        else:
            hi = b
        a, b = hi - gr * (hi - lo), lo + gr * (hi - lo)
    return loglik((lo + hi) / 2, beta)

BHAT = math.log(A * D / (B * C))                       # the fit is saturated, so exact
SE = math.sqrt(1 / A + 1 / B + 1 / C + 1 / D)
LMAX = profile(BHAT)

dev = lambda b: 2 * (profile(b) - LMAX)                # peaks at 0, at b = BHAT
LRT = -dev(0.0)
WALD = (BHAT / SE) ** 2

# The score parabola: tangent to the deviance at the null, with the null's curvature. Its
# rise above the null point is exactly the score statistic, which is Pearson's chi-square.
h = 1e-4
d1 = (dev(h) - dev(-h)) / (2 * h)
d2 = (dev(h) - 2 * dev(0.0) + dev(-h)) / h ** 2
SCORE = -d1 ** 2 / (2 * d2)
BSTAR = -d1 / d2                                       # where that parabola peaks
wald_par = lambda b: -((b - BHAT) ** 2) / SE ** 2
score_par = lambda b: dev(0.0) + d1 * b + 0.5 * d2 * b ** 2

FLOOR, TOP = -46.0, 5.0
ax = Axes(86.0, 470.0, 46.0, 250.0, (-0.55, 2.95), (FLOOR, TOP))
o = [ax.frame()]
o.append(ax.ygrid([-40, -30, -20, -10, 0], ['-40', '-30', '-20', '-10', '0']))
o.append(ax.xticks([0.0, 0.5, 1.0, 1.5, 2.0, 2.5], ['0', '0.5', '1.0', '1.5', '2.0', '2.5']))

def clipped(f, width=2, **kw):
    """Sample f across the axis, keeping only what stays inside the frame."""
    pts, runs = [], []
    a, b = ax.xlim
    for i in range(361):
        x = a + (b - a) * i / 360
        y = f(x)
        if FLOOR <= y <= TOP:
            pts.append((ax.px(x), ax.py(y)))
        elif pts:
            runs.append(pts); pts = []
    if pts:
        runs.append(pts)
    return ''.join(path(r, width=width, **kw) for r in runs if len(r) > 1)

o.append(clipped(dev, width=2))
o.append(clipped(wald_par, width=1.6, dash='7 4', opacity='.75'))
o.append(clipped(score_par, width=1.6, dash='2 4', opacity='.75'))

# the null and the estimate
for b, lab in ((0.0, 'null: β = 0'), (BHAT, 'MLE: β = 1.7918')):
    o.append(line(ax.px(b), ax.py(FLOOR), ax.px(b), ax.py(TOP), 1, opacity='.28', dash='3 3'))
o.append(text(ax.px(BHAT), ax.py(TOP) - 8, 'MLE: β = log 6 = 1.7918', 10.5, anchor='middle', weight='600'))
o.append(text(ax.px(0.0) + 5, ax.py(TOP) - 8, 'null: β = 0', 10.5, weight='600'))

def bar(x, ylo, yhi, colour, opacity=None):
    px = ax.px(x)
    out = line(px, ax.py(ylo), px, ax.py(yhi), 2, stroke=colour, opacity=opacity)
    for y in (ylo, yhi):
        out += line(px - 4, ax.py(y), px + 4, ax.py(y), 2, stroke=colour, opacity=opacity)
    return out

# LRT — the real drop, on the real curve
o.append(bar(0.0, dev(0.0), 0.0, ACCENT))
o.append(circle(ax.px(0.0), ax.py(dev(0.0)), 4.5, fill=ACCENT))
o.append(circle(ax.px(BHAT), ax.py(0.0), 4.5, fill=ACCENT))
# Wald — the drop the fitted parabola predicts
o.append(line(ax.px(-0.30), ax.py(wald_par(0.0)), ax.px(0.0), ax.py(wald_par(0.0)),
              1, opacity='.35', dash='2 3'))
o.append(bar(-0.30, wald_par(0.0), 0.0, 'currentColor', opacity='.75'))
o.append(circle(ax.px(0.0), ax.py(wald_par(0.0)), 3.5, fill='currentColor', opacity='.75'))
# score — the rise its own parabola predicts, measured up from the null
o.append(line(ax.px(0.0), ax.py(dev(0.0)), ax.px(BSTAR), ax.py(dev(0.0)),
              1, opacity='.35', dash='2 3'))
o.append(bar(BSTAR, dev(0.0), score_par(BSTAR), 'currentColor', opacity='.75'))
o.append(circle(ax.px(BSTAR), ax.py(score_par(BSTAR)), 3.5, fill='currentColor', opacity='.75'))

# labels, stacked clear of the plot in the right-hand margin
LX = ax.x1 + 14
LEGEND = [
    (78, 'LRT = %.4f' % LRT, ['the drop on the true curve'], ACCENT),
    (124, 'score = %.4f' % SCORE, ['the rise of the parabola', 'fitted at the null'], None),
    (183, 'Wald = %.4f' % WALD, ['the drop of the parabola', 'fitted at the MLE'], None),
]
for y0, head, tail, col in LEGEND:
    o.append(text(LX, y0, head, 11, weight='700', fill=col or 'currentColor'))
    for i, t in enumerate(tail):
        o.append(text(LX, y0 + 15 + 13 * i, t, 10, opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, 292, 'Log odds ratio β', 12, anchor='middle'))
o.append(text(20, 148, 'Deviance, relative to the maximum', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 148)"'))
o.append(text(20, 22, 'One likelihood, three ways of asking how far the null is from its maximum',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-mathematical-foundations-tests.svg'),
                           svg(640, 306, ''.join(o))))
print('  LRT %.4f  score %.4f  Wald %.4f   bhat %.6f  se %.6f  bstar %.4f'
      % (LRT, SCORE, WALD, BHAT, SE, BSTAR))

# ── Figure 2: what the genome-wide threshold is calibrated to ─────────────────
ALPHA_NAIVE, ALPHA_GW = 0.05, 5e-8
fwer = lambda m, a: 1 - (1 - a) ** m
MEFF = 1e6

ax2 = Axes(74.0, 600.0, 34.0, 250.0, (1e1, 1e8), (0.0, 1.0), xlog=True)
p = [ax2.frame()]
p.append(ax2.ygrid([0.0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1.00']))
p.append(ax2.xticks([1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
                    ['10', '100', '1k', '10k', '100k', '1M', '10M', '100M']))
p.append(line(ax2.x0, ax2.py(0.05), ax2.x1, ax2.py(0.05), 1.25, opacity='.45', dash='4 4'))
p.append(text(ax2.x0 + 6, ax2.py(0.05) - 8, 'the 5% you meant to spend', 10.5, opacity='.7'))

p.append(ax2.curve(lambda m: fwer(m, ALPHA_NAIVE), n=240, width=2))
p.append(text(ax2.px(220), ax2.py(0.88), 'each variant tested at 0.05', 11, opacity='.85'))

p.append(ax2.curve(lambda m: fwer(m, ALPHA_GW), n=240, width=2, dash='7 4'))
p.append(text(ax2.px(9e6), ax2.py(0.52), 'each variant tested at 5 × 10⁻⁸', 11,
              anchor='end', opacity='.85'))

reached = fwer(MEFF, ALPHA_GW)
p.append(circle(ax2.px(MEFF), ax2.py(reached), 4.5, fill=ACCENT))
p.append(line(ax2.px(MEFF), ax2.py(reached), ax2.px(MEFF), ax2.py(0.0), 1, opacity='.3', dash='3 3'))
p.append(text(ax2.px(MEFF), ax2.py(reached) - 13,
              'at 1M independent tests, the risk is %.4f' % reached, 10.5,
              anchor='middle', fill=ACCENT, weight='600'))

p.append(text((ax2.x0 + ax2.x1) / 2, 292, 'Independent tests performed (log scale)', 12,
              anchor='middle'))
p.append(text(18, 142, 'Chance of at least one false positive', 11.5, anchor='middle',
              extra='transform="rotate(-90 18 142)"'))
p.append(text(18, 22,
              'The threshold is not a convention: it is 0.05 divided by how many tests there really are',
              11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-mathematical-foundations-multiplicity.svg'),
                           svg(640, 306, ''.join(p))))
print('  FWER at 1M tests, alpha=5e-8: %.6f' % reached)
