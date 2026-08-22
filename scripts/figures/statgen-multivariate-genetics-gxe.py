import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# The worked example's matrices, in trait-1 / trait-2 space.
G = [[40.0, 20.0], [20.0, 30.0]]
P = [[100.0, 30.0], [30.0, 80.0]]
S = [10.0, 0.0]

detP = P[0][0] * P[1][1] - P[0][1] * P[1][0]
BETA = [(P[1][1] * S[0] - P[0][1] * S[1]) / detP,
        (P[0][0] * S[1] - P[1][0] * S[0]) / detP]
DZ = [G[0][0] * BETA[0] + G[0][1] * BETA[1],
      G[1][0] * BETA[0] + G[1][1] * BETA[1]]

tr, det = G[0][0] + G[1][1], G[0][0] * G[1][1] - G[0][1] * G[1][0]
disc = math.sqrt(tr * tr - 4 * det)
L1, L2 = (tr + disc) / 2, (tr - disc) / 2
GMAX_SLOPE = (L1 - G[0][0]) / G[0][1]

# ── Figure 1: selection pushes one way, G sends the response another ──────────
ax = Axes(96.0, 424.0, 46.0, 250.0, (-1.6, 4.6), (-1.6, 2.4))
o = [ax.frame()]
o.append(ax.ygrid([-1, 0, 1, 2], ['-1', '0', '+1', '+2']))
o.append(ax.xticks([-1, 0, 1, 2, 3, 4], ['-1', '0', '+1', '+2', '+3', '+4']))
o.append(line(ax.px(-1.6), ax.py(0), ax.px(4.6), ax.py(0), 1, opacity='.35'))
o.append(line(ax.px(0), ax.py(-1.6), ax.px(0), ax.py(2.4), 1, opacity='.35'))

def arrow(x0, y0, x1, y1, colour, width=2.4, dash=None, op=None):
    out = line(ax.px(x0), ax.py(y0), ax.px(x1), ax.py(y1), width, stroke=colour,
               dash=dash, opacity=op)
    ang = math.atan2(ax.py(y1) - ax.py(y0), ax.px(x1) - ax.px(x0))
    for t in (2.6, -2.6):
        out += line(ax.px(x1), ax.py(y1),
                    ax.px(x1) - 11 * math.cos(ang - t / 6), ax.py(y1) - 11 * math.sin(ang - t / 6),
                    width, stroke=colour, opacity=op)
    return out

# g_max: the direction in which the population carries most of its genetic variance.
# Clipped to the frame — unclipped it leaves the axes and crosses the title.
TOP = 2.4 / GMAX_SLOPE
o.append(line(ax.px(-1.55), ax.py(-1.55 * GMAX_SLOPE), ax.px(TOP), ax.py(2.4),
              1.6, opacity='.4', dash='6 4'))
o.append(text(ax.px(TOP) - 8, ax.py(2.4) + 13, 'g_max', 10.5, anchor='end', opacity='.7',
              weight='600'))

# the selection gradient, scaled up so its direction is visible on the same axes
SC = 26.0
o.append(arrow(0, 0, BETA[0] * SC, BETA[1] * SC, 'currentColor', 2.2, op='.85'))
# anchored back along the arrow: forward of the tip is the margin column
o.append(text(ax.px(BETA[0] * SC) - 10, ax.py(BETA[1] * SC) + 8,
              'β = P⁻¹s, the direct selection', 10.5, anchor='end', weight='600'))
o.append(text(ax.px(BETA[0] * SC) - 10, ax.py(BETA[1] * SC) + 22,
              '(drawn ×26; trait 2 pushed down)', 10, anchor='end', opacity='.75'))

# the realised response
o.append(arrow(0, 0, DZ[0], DZ[1], ACCENT, 2.6))
o.append(circle(ax.px(DZ[0]), ax.py(DZ[1]), 4.5, fill=ACCENT))
o.append(text(ax.px(DZ[0]) - 12, ax.py(DZ[1]) - 19, 'Δz̄ = Gβ, the response', 10.5,
              anchor='end', fill=ACCENT, weight='600'))

LX = ax.x1 + 14
o.append(text(LX, 74, 'Selection pushes trait 2', 11, weight='700'))
o.append(text(LX, 90, 'down; it goes up.', 11, weight='700'))
for i2, s2 in enumerate(['β  = (+0.1127, −0.0423)', 'Δz̄ = (+3.6620, +0.9859)', '',
                         'The genetic covariance', 'of +20 drags trait 2 with', 'trait 1 and overrides the',
                         'direct selection against', 'it. Response follows G,', 'not β.']):
    o.append(text(LX, 116 + 14 * i2, s2, 10, opacity='.85'))
o.append(text(LX, 250, '%.1f%% of genetic variance' % (100 * L1 / (L1 + L2)), 10, opacity='.75'))
o.append(text(LX, 263, 'lies along g_max (%.1f°)' % (math.degrees(math.atan(GMAX_SLOPE))), 10,
              opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, 292, 'Change in trait 1', 12, anchor='middle'))
o.append(text(20, 148, 'Change in trait 2', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 148)"'))
o.append(text(20, 22, 'The response is not parallel to the selection that caused it',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-multivariate-genetics-gxe-deflection.svg'),
                           svg(640, 306, ''.join(o))))
print('  beta %s  dz %s  lambda %.4f/%.4f  gmax slope %.6f (%.2f deg)  share %.6f'
      % ([round(v, 6) for v in BETA], [round(v, 6) for v in DZ], L1, L2, GMAX_SLOPE,
         math.degrees(math.atan(GMAX_SLOPE)), L1 / (L1 + L2)))

# ── Figure 2: G×E as two traits, and where the correlation stops being one ────
# Four genotypes across two environments. Two of them cross — the best in A is only third
# in B — which is the strong form of G x E: a rank change, not merely a scale change.
# r_g is computed from the four pairs, so the number in the caption is the figure's own.
NORMS = [(1.2, 0.3), (0.4, 2.4), (-0.5, 1.4), (-1.1, -0.9)]
mA = sum(a for a, _ in NORMS) / len(NORMS)
mB = sum(b for _, b in NORMS) / len(NORMS)
cov = sum((a - mA) * (b - mB) for a, b in NORMS) / len(NORMS)
sdA = math.sqrt(sum((a - mA) ** 2 for a, _ in NORMS) / len(NORMS))
sdB = math.sqrt(sum((b - mB) ** 2 for _, b in NORMS) / len(NORMS))
RG = cov / (sdA * sdB)

ax2 = Axes(112.0, 372.0, 50.0, 238.0, (-0.4, 1.4), (-1.9, 3.0))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([-1, 0, 1, 2, 3], ['-1', '0', '+1', '+2', '+3']))
p2.append(ax2.xticks([0, 1], ['environment A', 'environment B']))
for k, (a2, b2) in enumerate(NORMS):
    crossing = k in (0, 1)
    col = ACCENT if crossing else 'currentColor'
    op = None if crossing else '.45'
    p2.append(line(ax2.px(0), ax2.py(a2), ax2.px(1), ax2.py(b2), 2.2 if crossing else 1.8,
                   stroke=col, opacity=op))
    for xx, yy in ((0, a2), (1, b2)):
        p2.append(circle(ax2.px(xx), ax2.py(yy), 4.2, fill=col, opacity=op))

p2.append(text(ax2.px(0) - 9, ax2.py(NORMS[0][0]) + 4, 'best in A', 10, anchor='end',
               fill=ACCENT, weight='600'))
p2.append(text(ax2.px(1) + 9, ax2.py(NORMS[0][1]) + 4, 'only third in B', 10,
               fill=ACCENT, weight='600'))
p2.append(text(ax2.px(0) - 9, ax2.py(NORMS[1][0]) + 4, 'second in A', 10, anchor='end',
               fill=ACCENT, weight='600'))
p2.append(text(ax2.px(1) + 9, ax2.py(NORMS[1][1]) + 4, 'best in B', 10,
               fill=ACCENT, weight='600'))

LX = ax2.x1 + 74
p2.append(text(LX, 74, 'A trait measured in two', 11, weight='700'))
p2.append(text(LX, 90, 'environments is two traits', 11, weight='700'))
for i2, s2 in enumerate(['related by a genetic',
                         'correlation r_g < 1.', '',
                         'These four genotypes give',
                         'r_g = %.4f, and two of' % RG,
                         'them change rank — the',
                         'strong form of G × E.', '',
                         'Robertson: below r_g ≈ 0.8',
                         'the two environments are',
                         'worth separate programmes.']):
    p2.append(text(LX, 114 + 14 * i2, s2, 10, opacity='.85'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 282, 'Environment', 12, anchor='middle'))
p2.append(text(22, 144, 'Genotypic value', 11.5, anchor='middle',
               extra='transform="rotate(-90 22 144)"'))
p2.append(text(20, 22, 'Genotype × environment: when the ranking itself changes',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-multivariate-genetics-gxe-reaction.svg'),
                           svg(640, 296, ''.join(p2))))
print('  r_g %.6f  sdA %.6f  sdB %.6f  cov %.6f' % (RG, sdA, sdB, cov))
