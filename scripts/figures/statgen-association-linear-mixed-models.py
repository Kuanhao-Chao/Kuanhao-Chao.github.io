import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')
CHI2_MEDIAN = 0.4549364231195727

# ── Figure 1: two different causes, one indistinguishable Q-Q plot ────────────
# Confounding adds a constant to every statistic (the LD-score intercept); polygenicity
# scales them, because the non-centrality grows with LD score. Both are tuned here to give
# lambda_GC = 1.20 exactly, which is the point: a median statistic cannot separate them.
LAMBDA = 1.20
ADD = LAMBDA * CHI2_MEDIAN - CHI2_MEDIAN          # 0.090988
MULT = LAMBDA

def chi2_quantile(p):
    """Upper-tail quantile of chi-square on 1 df, via the normal: chi2 = z^2."""
    return norm_quantile(1 - p / 2) ** 2

def norm_quantile(p):
    # Acklam's rational approximation, adequate for drawing
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    pl, ph = 0.02425, 1 - 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > ph:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

def chi2_upper_p(x):
    return math.erfc(math.sqrt(x / 2))

M = 400
EXP, CONF, POLY = [], [], []
for k in range(1, M + 1):
    u = (k - 0.5) / M                       # expected upper-tail probability
    x = -math.log10(u)
    null_chi2 = chi2_quantile(u)
    EXP.append(x)
    CONF.append(-math.log10(max(chi2_upper_p(null_chi2 + ADD), 1e-30)))
    POLY.append(-math.log10(max(chi2_upper_p(null_chi2 * MULT), 1e-30)))

ax = Axes(88.0, 424.0, 46.0, 246.0, (0.0, 3.0), (0.0, 4.6))
o = [ax.frame()]
o.append(ax.ygrid([0, 1, 2, 3, 4], ['0', '1', '2', '3', '4']))
o.append(ax.xticks([0, 1, 2, 3], ['0', '1', '2', '3']))
o.append(line(ax.px(0), ax.py(0), ax.px(3), ax.py(3), 1.4, opacity='.45', dash='5 3'))
o.append(text(ax.px(2.45), ax.py(2.45) - 9, 'null', 10.5, opacity='.65', weight='600'))

o.append(path([(ax.px(EXP[i]), ax.py(CONF[i])) for i in range(M) if EXP[i] <= 3.0], width=2))
o.append(path([(ax.px(EXP[i]), ax.py(POLY[i])) for i in range(M) if EXP[i] <= 3.0],
              width=2, stroke=ACCENT))

# The median is the only place lambda_GC looks, and by construction both curves meet there.
MEDX = -math.log10(0.5)
o.append(line(ax.px(MEDX), ax.py(0), ax.px(MEDX), ax.py(4.6), 1, opacity='.4', dash='3 3'))
o.append(text(ax.px(MEDX) + 7, ax.py(4.15), 'the median —', 10, opacity='.75'))
o.append(text(ax.px(MEDX) + 7, ax.py(3.95), 'all λ_GC looks at', 10, opacity='.75'))

LX = ax.x1 + 14
o.append(text(LX, 72, 'λ_GC = 1.20 for both', 11, weight='700'))
o.append(line(LX, 94, LX + 20, 94, 2, stroke=ACCENT))
o.append(text(LX + 27, 98, 'polygenic', 10.5, weight='600', fill=ACCENT))
for i2, t in enumerate(['scales every statistic,', 'so the tail really is', 'enriched']):
    o.append(text(LX, 114 + 13 * i2, t, 10, opacity='.85'))
o.append(line(LX, 168, LX + 20, 168, 2))
o.append(text(LX + 27, 172, 'confounding', 10.5, weight='600'))
for i2, t in enumerate(['adds a constant, which', 'the median notices and', 'the tail barely does']):
    o.append(text(LX, 188 + 13 * i2, t, 10, opacity='.85'))
for i2, t in enumerate(['One number, two different', 'things. LD score regression',
                        'separates them by using', 'the whole line instead of', 'one point on it.']):
    o.append(text(LX, 242 + 13 * i2, t, 10, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 288, 'Expected −log₁₀ p', 12, anchor='middle'))
o.append(text(20, 146, 'Observed −log₁₀ p', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 146)"'))
o.append(text(20, 22, 'One λ_GC of 1.20, arrived at two completely different ways',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-association-linear-mixed-models-qq.svg'),
                           svg(640, 322, ''.join(o))))
print('  additive lift %.6f  multiplicative %.2f  -> lambda %.4f both'
      % (ADD, MULT, (CHI2_MEDIAN + ADD) / CHI2_MEDIAN))

# ── Figure 2: why the tested chromosome has to leave the relatedness matrix ───
o2 = []
BARY, BARH, X0, X1 = 96, 26, 96, 470
CHR = 8
w = (X1 - X0) / CHR
for k in range(CHR):
    tested = k == 3
    o2.append(rect(X0 + k * w + 2, BARY, w - 4, BARH,
                   fill=ACCENT if tested else 'currentColor',
                   opacity=None if tested else '.28'))
    o2.append(text(X0 + k * w + w / 2, BARY + 17, 'chr %d' % (k + 1), 9.5, anchor='middle',
                   fill='var(--color-on-accent,#fff)' if tested else 'currentColor',
                   opacity=None if tested else '.75'))
o2.append(text(X0, BARY - 12, 'the variant being tested sits on chromosome 4', 11, weight='600'))

# naive GRM: every chromosome, including the one under test
o2.append(text(X0, BARY + 66, 'GRM built from all chromosomes', 11, weight='700'))
for k in range(CHR):
    o2.append(rect(X0 + k * w + 2, BARY + 78, w - 4, 16,
                   fill=ACCENT if k == 3 else 'currentColor', opacity='.5'))
o2.append(text(X0, BARY + 116,
               'the random effect already contains the variant under test, so it absorbs', 10,
               opacity='.85'))
o2.append(text(X0, BARY + 130,
               'part of the signal it is supposed to be a control for — proximal contamination,', 10,
               opacity='.85'))
o2.append(text(X0, BARY + 144, 'and the test loses power.', 10, opacity='.85'))

# LOCO
o2.append(text(X0, BARY + 180, 'GRM leaving chromosome 4 out (LOCO)', 11, weight='700',
               fill=ACCENT))
for k in range(CHR):
    if k == 3:
        o2.append(rect(X0 + k * w + 2, BARY + 192, w - 4, 16, fill='none',
                       stroke='currentColor', sw=1.2, opacity='.45'))
    else:
        o2.append(rect(X0 + k * w + 2, BARY + 192, w - 4, 16, fill='currentColor', opacity='.5'))
o2.append(text(X0, BARY + 230,
               'relatedness is still controlled, from every other chromosome, and the', 10,
               opacity='.85'))
o2.append(text(X0, BARY + 244,
               'tested variant is no longer competing against itself.', 10, opacity='.85'))

o2.append(text(X0, 40, 'Leave one chromosome out: the fix for a control that controls too much',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-association-linear-mixed-models-loco.svg'),
                           svg(640, 372, ''.join(o2))))
