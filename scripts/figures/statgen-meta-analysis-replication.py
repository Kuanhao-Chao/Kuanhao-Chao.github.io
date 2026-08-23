import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: a forest plot, with the two weightings side by side ────────────
STUDIES = [('study 1', 0.10, 0.020, 20000),
           ('study 2', 0.06, 0.015, 30000),
           ('study 3', 0.14, 0.040, 25000),
           ('study 4', 0.08, 0.018, 22000)]
IVW_W = [1 / se ** 2 for _, _, se, _ in STUDIES]
N_W = [math.sqrt(n) for _, _, _, n in STUDIES]
POOLED, POOLED_SE = 0.079870, 0.009687

ax = Axes(150.0, 400.0, 52.0, 208.0, (0.0, 0.24), (-1.4, 3.6))
o = [ax.frame()]
o.append(ax.xticks([0, 0.05, 0.10, 0.15, 0.20], ['0', '0.05', '0.10', '0.15', '0.20']))
o.append(line(ax.px(0), ax.py(-1.4), ax.px(0), ax.py(3.6), 1, opacity='.4', dash='4 3'))

tot_i = sum(IVW_W)
tot_n = sum(N_W)
for k, (name, b, se, n) in enumerate(STUDIES):
    y = ax.py(3 - k)
    o.append(line(ax.px(b - 1.96 * se), y, ax.px(b + 1.96 * se), y, 1.6, opacity='.7'))
    for e in (b - 1.96 * se, b + 1.96 * se):
        o.append(line(ax.px(e), y - 4, ax.px(e), y + 4, 1.6, opacity='.7'))
    # Box AREA proportional to the inverse-variance weight, which is what a forest plot
    # conventionally encodes and what the caption promises — so the side goes as the square
    # root. An affine side length (4 + 12 w/w_max) reads as area ∝ w² and understates the
    # spread: study 3 drew at 13% of the largest box where its weight is 14%.
    s = 16 * math.sqrt(IVW_W[k] / max(IVW_W))
    o.append(rect(ax.px(b) - s / 2, y - s / 2, s, s, fill=ACCENT))
    o.append(text(ax.x0 - 12, y + 4, name, 10.5, anchor='end'))
    o.append(text(ax.x1 + 12, y + 4, '%4.1f%%' % (100 * IVW_W[k] / tot_i), 10, weight='600',
                  fill=ACCENT))
    o.append(text(ax.x1 + 62, y + 4, '%4.1f%%' % (100 * N_W[k] / tot_n), 10, opacity='.75'))

o.append(text(ax.x1 + 12, ax.py(3.6) + 2, 'IVW', 10, weight='700', fill=ACCENT))
o.append(text(ax.x1 + 62, ax.py(3.6) + 2, '√N', 10, weight='700', opacity='.75'))

# the pooled estimate, as a diamond
yD = ax.py(-0.9)
lo, hi = POOLED - 1.96 * POOLED_SE, POOLED + 1.96 * POOLED_SE
o.append(path([(ax.px(lo), yD), (ax.px(POOLED), yD - 8), (ax.px(hi), yD),
               (ax.px(POOLED), yD + 8), (ax.px(lo), yD)], width=1.6, stroke=ACCENT))
o.append(text(ax.x0 - 12, yD + 4, 'pooled (IVW)', 10.5, anchor='end', weight='700'))
o.append(text(ax.px(hi) + 8, yD + 4, '0.0799', 10.5, weight='600', fill=ACCENT))

o.append(text(30, 274, 'Study 3 has 25,000 people but a standard error of 0.040, so inverse-variance',
              10.5, opacity='.85'))
o.append(text(30, 289, 'weighting gives it 5.9%% while √N weighting gives it %.1f%% — the largest'
              % (100 * N_W[2] / tot_n), 10.5, opacity='.85'))
o.append(text(30, 304, 'effect estimate in the set, and the least trustworthy one.', 10.5,
              opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 246, 'Effect estimate (95% CI)', 12, anchor='middle'))
o.append(text(20, 22, 'Sample size is a proxy for precision, and the two come apart',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-meta-analysis-replication-forest.svg'),
                           svg(640, 320, ''.join(o))))
for k, (name, b, se, n) in enumerate(STUDIES):
    print('   %s beta %.2f se %.3f N %d -> IVW %.1f%%  sqrtN %.1f%%'
          % (name, b, se, n, 100 * IVW_W[k] / tot_i, 100 * N_W[k] / tot_n))

# ── Figure 2: the winner's curse bites hardest at the threshold ──────────────
THRESH = 5.451310

def norm_pdf(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)

def norm_cdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))

def expected(true_z):
    num = norm_pdf(true_z - THRESH) - norm_pdf(true_z + THRESH)
    den = norm_cdf(true_z - THRESH) + norm_cdf(-true_z - THRESH)
    return true_z + num / den

ax2 = Axes(96.0, 430.0, 46.0, 244.0, (4.0, 10.0), (0.0, 32.0))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([0, 8, 16, 24, 32], ['0', '8', '16', '24', '32']))
p2.append(ax2.xticks([4, 5, 6, 7, 8, 9, 10], ['4', '5', '6', '7', '8', '9', '10']))
# Clipped to the frame: below z ≈ 4.4 the inflation runs off the top and crosses the title.
pts = []
for i in range(241):
    z = 4.0 + 6.0 * i / 240
    v = 100 * (expected(z) / z - 1)
    if 0.0 <= v <= 32.0:
        pts.append((ax2.px(z), ax2.py(v)))
p2.append(path(pts, width=2, stroke=ACCENT))

p2.append(line(ax2.px(THRESH), ax2.py(0), ax2.px(THRESH), ax2.py(32), 1.2, opacity='.45',
               dash='4 3'))
p2.append(text(ax2.px(THRESH) + 7, ax2.py(30), 'the discovery', 10, opacity='.75'))
p2.append(text(ax2.px(THRESH) + 7, ax2.py(28.2), 'threshold, |z| = 5.45', 10, opacity='.75'))

for z in (5.0, 6.0, 9.0):
    v = 100 * (expected(z) / z - 1)
    p2.append(circle(ax2.px(z), ax2.py(v), 4.2, fill=ACCENT))

LX = ax2.x1 + 14
p2.append(text(LX, 74, 'Inflation of the', 11, weight='700'))
p2.append(text(LX, 90, 'discovery estimate', 11, weight='700'))
for i, t in enumerate(['true z = 5.0  →  22.1%', 'true z = 6.0  →   8.1%',
                       'true z = 9.0  →   0.0%']):
    p2.append(text(LX, 114 + 14 * i, t, 10, opacity='.85'))
for i, t in enumerate(['The curse is worst just', 'below the threshold —',
                       'which is where most', 'discoveries live, because',
                       'that is where the effect', 'distribution is densest.']):
    p2.append(text(LX, 176 + 13 * i, t, 10, opacity='.85'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 288, 'True standardised effect, z', 12, anchor='middle'))
p2.append(text(20, 145, 'Expected overestimate (%)', 11.5, anchor='middle',
               extra='transform="rotate(-90 20 145)"'))
p2.append(text(20, 22, "The winner's curse: what discovery selects for", 11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-meta-analysis-replication-curse.svg'),
                           svg(640, 302, ''.join(p2))))
for z in (5.0, 5.451310, 6.0, 7.0, 9.0):
    print('   true z %.4f -> E %.6f  inflation %.2f%%' % (z, expected(z), 100 * (expected(z) / z - 1)))
