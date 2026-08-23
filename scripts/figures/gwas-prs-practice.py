import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── A fifty-fold ratio and an eight-percent risk ─────────────────────────────
# Absolute risk against score percentile, for a score explaining 10% of the liability of
# a disease with 2% prevalence. Both headline framings are true of this same curve: the
# extremes differ 50-fold, and the top centile is still more likely than not — far more
# likely — to stay well. Every value is asserted in deepDiveExamples.test.ts.
def ndtri(p):
    # Acklam's inverse normal, adequate for drawing; the asserted values come from the module.
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > 1 - pl:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

def ndtr(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))

K, R2 = 0.02, 0.10
T = ndtri(1 - K)
r = math.sqrt(R2)
risk = lambda pct: ndtr((r * ndtri(pct) - T) / math.sqrt(1 - R2))

ax = Axes(96.0, 430.0, 48.0, 224.0, (0.005, 0.995), (0.0, 0.09))
o = [ax.frame()]
o.append(ax.ygrid([0.0, 0.02, 0.04, 0.06, 0.08], ['0%', '2%', '4%', '6%', '8%']))
o.append(ax.xticks([0.01, 0.25, 0.5, 0.75, 0.99], ['1st', '25th', '50th', '75th', '99th']))
o.append(ax.curve(risk, n=240, width=2.2, stroke=ACCENT))
o.append(line(ax.x0, ax.py(K), ax.x1, ax.py(K), 1.3, opacity='.45', dash='5 4'))
o.append(text(ax.x0 + 8, ax.py(K) - 7, 'population risk, 2%', 10, opacity='.75'))

for pct, lab in ((0.99, '8.24%'), (0.90, '4.11%'), (0.01, '0.16%')):
    o.append(circle(ax.px(pct), ax.py(risk(pct)), 4.5, fill=ACCENT))
for pct, lab, anc, dx in ((0.99, '8.24%', 'end', -9), (0.90, '4.11%', 'start', 9),
                          (0.01, '0.16%', 'start', 9)):
    o.append(text(ax.px(pct) + dx, ax.py(risk(pct)) - 6, lab, 10, anchor=anc, fill=ACCENT,
                  weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 42, 'Polygenic score percentile', 12,
              anchor='middle'))
o.append(text(ax.x0 - 74, 26, 'Absolute lifetime risk', 11, opacity='.8'))

LX = ax.x1 + 22
o.append(text(LX, 62, 'Both are true.', 11, weight='700'))
for i, t in enumerate(['The top centile carries', '50.2 times the risk of',
                       'the bottom centile —', 'and a 91.76% chance of', 'never getting the',
                       'disease at all.']):
    o.append(text(LX, 82 + 13 * i, t, 10, opacity='.8'))
o.append(text(LX, 178, 'A fold-change needs', 11, weight='700'))
o.append(text(LX, 193, 'an absolute risk', 11, weight='700'))
o.append(text(LX, 208, 'beside it, always.', 11, weight='700'))

print('bytes:', write(os.path.join(OUT, 'gwas-prs-practice-absolute-risk.svg'),
                      svg(640, 284, ''.join(o))))
print('  top 1%% %.4f%%  90th %.4f%%  bottom 1%% %.4f%%  ratio %.1f'
      % (100*risk(0.99), 100*risk(0.90), 100*risk(0.01), risk(0.99)/risk(0.01)))
