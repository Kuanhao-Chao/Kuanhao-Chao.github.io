import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, Axes, ACCENT, circle

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: Wald, score and LRT are three readings of one curve ─────────────
# The 2x2 table from the worked example, as a logistic model with the intercept
# profiled out. Everything drawn is computed from that likelihood, so the picture
# and the arithmetic in the prose are the same object.
A, B, C, D = 240, 760, 200, 800          # case A / case a / control A / control a

def expit(t):
    return 1 / (1 + math.exp(-t))

def loglik(alpha, beta):
    p1, p0 = expit(alpha + beta), expit(alpha)
    return (A * math.log(p1) + B * math.log(1 - p1)
            + C * math.log(p0) + D * math.log(1 - p0))

def profile(beta):
    """max over the nuisance intercept, by golden-section on a unimodal function."""
    lo, hi = -8.0, 4.0
    gr = (math.sqrt(5) - 1) / 2
    a, b = hi - gr * (hi - lo), lo + gr * (hi - lo)
    for _ in range(200):
        if loglik(a, beta) < loglik(b, beta):
            lo = a
        else:
            hi = b
        a, b = hi - gr * (hi - lo), lo + gr * (hi - lo)
    return loglik((lo + hi) / 2, beta)

BHAT = math.log(A * D / (B * C))
SE = math.sqrt(1 / A + 1 / B + 1 / C + 1 / D)
LMAX = profile(BHAT)

# The deviance scale: 2[l(beta) - l(bhat)], so the maximum sits at zero and the drop at
# beta = 0 *is* the likelihood-ratio statistic.
dev = lambda b: 2 * (profile(b) - LMAX)
LRT = -dev(0.0)
WALD = (BHAT / SE) ** 2
# Score: the squared slope at the null over the information there. Both by central
# differences on the same profile curve, so no second formula is involved.
h = 1e-4
slope0 = (profile(h) - profile(-h)) / (2 * h)
info0 = -(profile(h) - 2 * profile(0.0) + profile(-h)) / h ** 2
SCORE = slope0 ** 2 / info0

ax = Axes(74.0, 606.0, 30.0, 250.0, (-0.12, 0.60), (-9.0, 1.2))
o = [ax.frame()]
o.append(ax.ygrid([-8, -6, -4, -2, 0], ['-8', '-6', '-4', '-2', '0']))
o.append(ax.xticks([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
                   ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6']))

# the profile deviance itself
o.append(ax.curve(dev, n=200, width=2))

# Wald: the parabola that agrees with the curve at the maximum, and nowhere else
o.append(ax.curve(lambda b: -((b - BHAT) ** 2) / SE ** 2, n=200, width=1.6, dash='7 4', opacity='.85'))

# Score: the tangent at the null, whose slope is the whole statistic
o.append(path([(ax.px(b), ax.py(dev(0.0) + slope0 * 2 * b)) for b in (-0.05, 0.20)],
              width=1.6, dash='2 4', opacity='.85'))

# the null and the estimate
for b, lab in ((0.0, 'null'), (BHAT, 'MLE')):
    o.append(line(ax.px(b), ax.y0, ax.px(b), ax.y1, 1, opacity='.3', dash='3 3'))
    o.append(text(ax.px(b), ax.y0 - 8, lab, 11, anchor='middle', opacity='.7'))

# the drop that is the LRT
o.append(line(ax.px(0.0), ax.py(0.0), ax.px(0.0), ax.py(-LRT), 2, stroke=ACCENT))
o.append(circle(ax.px(0.0), ax.py(-LRT), 4.5, fill=ACCENT))
o.append(circle(ax.px(BHAT), ax.py(0.0), 4.5, fill=ACCENT))
o.append(text(ax.px(0.0) + 8, ax.py(-LRT / 2), 'LRT = %.3f' % LRT, 11, fill=ACCENT, weight='600'))
o.append(text(ax.px(0.40), ax.py(-1.1), 'Wald: the parabola through the MLE, %.3f' % WALD, 11, opacity='.85'))
o.append(text(ax.px(0.155), ax.py(-7.6), 'score: the slope at the null, %.3f' % SCORE, 11, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 290, 'Log odds ratio', 12, anchor='middle'))
o.append(text(18, 140, '2[l(b) - l(b_hat)]', 11.5, anchor='middle',
              extra='transform="rotate(-90 18 140)"'))
o.append(text((ax.x0 + ax.x1) / 2, 16,
              'One likelihood, three ways of asking how far the null is from its maximum', 11.5,
              anchor='middle', opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-mathematical-foundations-tests.svg'),
                           svg(640, 302, ''.join(o))))
print('  LRT %.6f  Wald %.6f  score %.6f  bhat %.6f  se %.6f' % (LRT, WALD, SCORE, BHAT, SE))

# ── Figure 2: what the genome-wide threshold is calibrated to ─────────────────
ALPHA_NAIVE, ALPHA_GW = 0.05, 5e-8
fwer = lambda m, a: 1 - (1 - a) ** m
MEFF = 1e6

ax2 = Axes(74.0, 606.0, 30.0, 250.0, (1e1, 1e8), (0.0, 1.0), xlog=True)
p = [ax2.frame()]
p.append(ax2.ygrid([0.0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1.00'],
                   emphasise=(0.05,)))
p.append(ax2.xticks([1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
                    ['10', '100', '1k', '10k', '100k', '1M', '10M', '100M']))
p.append(line(ax2.x0, ax2.py(0.05), ax2.x1, ax2.py(0.05), 1.25, opacity='.45', dash='4 4'))
p.append(text(ax2.x0 + 6, ax2.py(0.05) - 7, 'the 5% you meant to spend', 10.5, opacity='.7'))

p.append(ax2.curve(lambda m: fwer(m, ALPHA_NAIVE), n=200, width=2))
p.append(text(ax2.px(300), ax2.py(0.86), 'testing each variant at 0.05', 11, opacity='.85'))

p.append(ax2.curve(lambda m: fwer(m, ALPHA_GW), n=200, width=2, dash='7 4'))
p.append(text(ax2.px(4e6), ax2.py(0.30), 'testing each variant at 5e-8', 11, anchor='start', opacity='.85'))

reached = fwer(MEFF, ALPHA_GW)
p.append(circle(ax2.px(MEFF), ax2.py(reached), 4.5, fill=ACCENT))
p.append(line(ax2.px(MEFF), ax2.py(reached), ax2.px(MEFF), ax2.y1, 1, opacity='.3', dash='3 3'))
p.append(text(ax2.px(MEFF), ax2.py(reached) - 12,
              'at 1M independent tests the risk is %.4f' % reached, 10.5,
              anchor='middle', fill=ACCENT, weight='600'))

p.append(text((ax2.x0 + ax2.x1) / 2, 290, 'Independent tests performed (log scale)', 12, anchor='middle'))
p.append(text(18, 140, 'Chance of at least one false positive', 11.5, anchor='middle',
              extra='transform="rotate(-90 18 140)"'))
p.append(text((ax2.x0 + ax2.x1) / 2, 16,
              'The threshold is not a convention: it is 0.05 divided by how many tests there really are',
              11.5, anchor='middle', opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-mathematical-foundations-multiplicity.svg'),
                           svg(640, 302, ''.join(p))))
print('  FWER at 1M tests, alpha=5e-8: %.6f' % reached)
print('  FWER at 1M tests, alpha=0.05: %.10f' % fwer(1e6, 0.05))
