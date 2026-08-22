import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, Axes, ACCENT

# The winner's curse, as a function of how far above the discovery threshold the truth sits.
# E[observed z | z > t] exceeds the true z most when the true effect is barely detectable,
# and vanishes for effects that would have been found anyway.
def pdf(z): return math.exp(-z * z / 2) / math.sqrt(2 * math.pi)
def cdf(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))
T = 5.4513  # z for p = 5e-8, two-sided
def observed(tz):
    return tz + (pdf(tz - T) - pdf(tz + T)) / (cdf(tz - T) + cdf(-tz - T))

ax = Axes(80.0, 590.0, 40.0, 250.0, (5.0, 9.0), (1.0, 1.25))
o = [ax.frame()]
o.append(ax.ygrid([1.0, 1.05, 1.10, 1.15, 1.20, 1.25],
                  ['1.00', '1.05', '1.10', '1.15', '1.20', '1.25']))
o.append(ax.xticks([5, 6, 7, 8, 9], ['5', '6', '7', '8', '9']))

o.append(line(ax.x0, ax.py(1.0), ax.x1, ax.py(1.0), 1.25, opacity='.35', dash='5 4'))
o.append(text(ax.x1 - 6, ax.py(1.0) - 8, 'no inflation', 10, anchor='end', opacity='.6'))
o.append(line(ax.px(T), ax.y0, ax.px(T), ax.y1, 1.25, stroke=ACCENT, dash='4 4'))
o.append(text(ax.px(T) + 7, ax.y0 + 14, 'discovery threshold, z = 5.4513', 10,
              fill=ACCENT, weight='600'))

o.append(ax.curve(lambda tz: min(1.25, observed(tz) / tz), n=200, width=2))
for tz in (5.45, 5.80, 6.50, 8.00):
    r = observed(tz) / tz
    o.append(circle(ax.px(tz), ax.py(r), 4.5, fill=ACCENT))
    o.append(text(ax.px(tz) + 8, ax.py(r) - 8, '%.4fx' % r, 10, fill=ACCENT, weight='600'))
    print('  true z %.2f -> observed %.4f, inflation %.4fx' % (tz, observed(tz), r))

o.append(text((ax.x0 + ax.x1) / 2, 290, 'True effect size, in units of z', 12, anchor='middle'))
o.append(text(18, 145, 'Expected inflation of the published estimate', 11.5, anchor='middle',
              extra='transform="rotate(-90 18 145)"'))
o.append(text((ax.x0 + ax.x1) / 2, 20,
              'The winner’s curse bites hardest exactly at the threshold that found the variant',
              11.5, anchor='middle', opacity='.8'))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-gwas-summary-stats.svg'),
                      svg(640, 304, ''.join(o))))
