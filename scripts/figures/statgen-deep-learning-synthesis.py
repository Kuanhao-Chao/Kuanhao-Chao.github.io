import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')
ODDS_VS = 350.0

def points(lr):
    return 8 * math.log(lr) / math.log(ODDS_VS)

def tier(lr):
    p = points(lr)
    return ('very strong' if p >= 8 else 'strong' if p >= 4
            else 'moderate' if p >= 2 else 'supporting' if p >= 1 else 'none')

def posterior(pts, prior=0.1):
    o = (prior / (1 - prior)) * ODDS_VS ** (pts / 8)
    return o / (1 + o)

SWEEP = [('0.50', 0.95, 0.400), ('0.75', 0.88, 0.200), ('0.90', 0.78, 0.120),
         ('0.98', 0.62, 0.060), ('0.995', 0.41, 0.015), ('0.999', 0.22, 0.004)]

# ── Figure 1: what a score is worth, once it is calibrated ──────────────────
# The evidence ladder is multiplicative: each ACMG point is the eighth root of 350, so the
# tier boundaries sit at 2.08, 4.33, 18.71 and 350 on the odds axis.
BOUNDS = [(1, 'supporting'), (2, 'moderate'), (4, 'strong'), (8, 'very strong')]

ax = Axes(150.0, 452.0, 56.0, 224.0, (1.0, 400.0), (-0.6, 6.0), xlog=True)
o = [ax.frame()]
o.append(ax.xticks([1, 2, 5, 10, 20, 50, 100, 350],
                   ['1', '2', '5', '10', '20', '50', '100', '350']))
# supporting (2.08) and moderate (4.33) sit close together on a log axis, so the labels are
# staggered rather than stacked.
for k, (pts, name) in enumerate(BOUNDS):
    x = ODDS_VS ** (pts / 8)
    if x > 400:
        continue
    o.append(line(ax.px(x), ax.py(-0.6), ax.px(x), ax.py(5.0), 1.2, opacity='.4', dash='4 3'))
    o.append(text(ax.px(x), ax.py(5.55 if k % 2 else 5.2), name, 9.5, anchor='middle',
                  opacity='.75'))

for k, (thr, tpr, fpr) in enumerate(SWEEP):
    lr = tpr / fpr
    y = ax.py(4.6 - k * 0.92)
    o.append(line(ax.px(1.0), y, ax.px(min(lr, 400)), y, 2,
                  stroke=ACCENT if points(lr) >= 4 else 'currentColor',
                  opacity=None if points(lr) >= 4 else '.5'))
    o.append(circle(ax.px(min(lr, 400)), y, 5,
                    fill=ACCENT if points(lr) >= 4 else 'currentColor',
                    opacity=None if points(lr) >= 4 else '.7'))
    o.append(text(ax.x0 - 12, y + 4, 'score ≥ %s' % thr, 10.5, anchor='end'))
    o.append(text(ax.px(min(lr, 400)) + 10, y + 4,
                  'LR+ %.2f → %.2f pts' % (lr, points(lr)), 10, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 262, 'Odds of pathogenicity (log scale)', 12, anchor='middle'))
o.append(text(20, 22, 'A model score becomes evidence only after it is tied to a likelihood ratio',
              11.5, opacity='.8'))
o.append(text(30, 288, 'The tier a score reaches is the tier it attains, so 3.19 points is moderate,',
              10.5, opacity='.85'))
o.append(text(30, 304, 'not "nearly strong". A confident-looking 0.98 earns moderate evidence and',
              10.5, opacity='.85'))
o.append(text(30, 320, 'moves a 10% prior to 53% — not to anything resembling 98%.', 10.5, opacity='.85'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-deep-learning-synthesis-ladder.svg'),
                           svg(640, 336, ''.join(o))))
for thr, tpr, fpr in SWEEP:
    lr = tpr / fpr
    print('   score>=%-6s LR+ %6.2f  %.3f pts  %-11s posterior %.4f'
          % (thr, lr, points(lr), tier(lr), posterior(points(lr))))

# ── Figure 2: the threshold that classifies best is not the one that proves most ─
ax2 = Axes(96.0, 424.0, 46.0, 238.0, (-0.4, 5.4), (0.0, 6.0))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([0, 2, 4, 6], ['0', '2', '4', '6']))
p2.append(ax2.xticks(list(range(6)), [s[0] for s in SWEEP]))

# ACMG points earned, rising with the threshold
pts_pts = [(ax2.px(i), ax2.py(points(t / f))) for i, (_, t, f) in enumerate(SWEEP)]
p2.append(path(pts_pts, width=2, stroke=ACCENT))
for x, y in pts_pts:
    p2.append(circle(x, y, 4.5, fill=ACCENT))

# Youden's J, rescaled onto the same axis so the shapes can be compared
j_pts = [(ax2.px(i), ax2.py((t - f) * 6)) for i, (_, t, f) in enumerate(SWEEP)]
p2.append(path(j_pts, width=2, dash='7 4', opacity='.8'))
for x, y in j_pts:
    p2.append(circle(x, y, 4, fill='currentColor', opacity='.7'))

jbest = max(range(len(SWEEP)), key=lambda i: SWEEP[i][1] - SWEEP[i][2])
ebest = max(range(len(SWEEP)), key=lambda i: SWEEP[i][1] / SWEEP[i][2])
p2.append(line(ax2.px(jbest), ax2.py(0), ax2.px(jbest), ax2.py(6.0), 1, opacity='.35', dash='3 3'))
p2.append(line(ax2.px(ebest), ax2.py(0), ax2.px(ebest), ax2.py(6.0), 1, opacity='.35', dash='3 3'))

LX = ax2.x1 + 14
p2.append(line(LX, 70, LX + 20, 70, 2, stroke=ACCENT))
p2.append(text(LX + 27, 74, 'ACMG points', 10.5, weight='600', fill=ACCENT))
p2.append(text(LX, 90, 'rises all the way —', 10, opacity='.8'))
p2.append(text(LX, 103, 'evidence wants a low', 10, opacity='.8'))
p2.append(text(LX, 116, 'false-positive rate', 10, opacity='.8'))
p2.append(line(LX, 142, LX + 20, 142, 2, dash='7 4', opacity='.8'))
p2.append(text(LX + 27, 146, "Youden's J", 10.5, weight='600'))
p2.append(text(LX, 162, '(×6, to share the axis)', 10, opacity='.8'))
p2.append(text(LX, 175, 'peaks at 0.75 and falls', 10, opacity='.8'))
p2.append(text(LX, 202, 'Same model, same data.', 10, weight='600'))
p2.append(text(LX, 216, 'Classifying best: 33%', 10, opacity='.85'))
p2.append(text(LX, 229, 'posterior. Proving most:', 10, opacity='.85'))
p2.append(text(LX, 242, '86%.', 10, opacity='.85'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 280, 'Score threshold', 12, anchor='middle'))
p2.append(text(20, 142, 'ACMG points  /  J × 6', 11.5, anchor='middle',
               extra='transform="rotate(-90 20 142)"'))
p2.append(text(20, 22, 'The operating point a benchmark picks is the one that proves least',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-deep-learning-synthesis-threshold.svg'),
                           svg(640, 296, ''.join(p2))))
print('   Youden max at %s, evidence max at %s' % (SWEEP[jbest][0], SWEEP[ebest][0]))
