import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

TRUE = 0.30
GX = [0.10, 0.12, 0.08, 0.15, 0.09, 0.11, 0.13, 0.07]
PLEIO = [0, 0, 0, 0, 0, 0.02, 0.02, 0.02]
GY = [round(TRUE * g + PLEIO[i], 6) for i, g in enumerate(GX)]
SEY = [0.006] * len(GX)
IVW, IVW_SE = 0.365058, 0.019436
EGG_SLOPE, EGG_SE, EGG_INT = 0.264912, 0.157663, 0.011228
MEDIAN = 0.300000

# ── Figure 1: the scatter the three estimators are fitted to ─────────────────
ax = Axes(96.0, 424.0, 46.0, 240.0, (0.0, 0.17), (0.0, 0.068))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.02, 0.04, 0.06], ['0', '0.02', '0.04', '0.06']))
o.append(ax.xticks([0, 0.05, 0.10, 0.15], ['0', '0.05', '0.10', '0.15']))

# IVW: forced through the origin
o.append(line(ax.px(0), ax.py(0), ax.px(0.17), ax.py(IVW * 0.17), 2, stroke=ACCENT))
# Egger: intercept free
o.append(line(ax.px(0), ax.py(EGG_INT), ax.px(0.17), ax.py(EGG_INT + EGG_SLOPE * 0.17),
              2, dash='7 4', opacity='.85'))
# the truth
o.append(line(ax.px(0), ax.py(0), ax.px(0.17), ax.py(TRUE * 0.17), 1.4, opacity='.4', dash='2 4'))

for i, (gx, gy) in enumerate(zip(GX, GY)):
    bad = PLEIO[i] > 0
    o.append(line(ax.px(gx), ax.py(gy - 1.96 * SEY[i]), ax.px(gx), ax.py(gy + 1.96 * SEY[i]),
                  1.2, opacity='.45'))
    o.append(circle(ax.px(gx), ax.py(gy), 5,
                    fill='currentColor' if bad else ACCENT, opacity='.85' if bad else None))

o.append(circle(ax.px(0), ax.py(EGG_INT), 3.5, fill='currentColor', opacity='.85'))

LX = ax.x1 + 14
o.append(circle(LX + 7, 72, 5, fill=ACCENT))
o.append(text(LX + 19, 76, 'valid (5)', 10.5, weight='600', fill=ACCENT))
o.append(circle(LX + 7, 92, 5, fill='currentColor', opacity='.85'))
o.append(text(LX + 19, 96, 'pleiotropic (3)', 10.5, weight='600'))
o.append(text(LX, 122, 'each lifted +0.02 on', 10, opacity='.8'))
o.append(text(LX, 135, 'the outcome, by a route', 10, opacity='.8'))
o.append(text(LX, 148, 'that is not the exposure', 10, opacity='.8'))
o.append(line(LX, 176, LX + 22, 176, 2, stroke=ACCENT))
o.append(text(LX + 29, 180, 'IVW', 10.5, weight='600', fill=ACCENT))
o.append(text(LX, 196, 'forced through the origin', 10, opacity='.8'))
o.append(line(LX, 214, LX + 22, 214, 2, dash='7 4', opacity='.85'))
o.append(text(LX + 29, 218, 'Egger', 10.5, weight='600'))
o.append(text(LX, 234, 'intercept free, at 0.0112', 10, opacity='.8'))
o.append(line(LX, 256, LX + 22, 256, 1.4, opacity='.4', dash='2 4'))
o.append(text(LX + 29, 260, 'the truth, 0.30', 10.5, weight='600', opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, 282, 'Instrument effect on the exposure, γ_X', 12,
              anchor='middle'))
o.append(text(20, 143, 'Effect on the outcome, γ_Y', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 143)"'))
o.append(text(20, 22, 'Three pleiotropic instruments lift the line that has to pass through zero',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-mendelian-randomization-scatter.svg'),
                           svg(640, 300, ''.join(o))))

# ── Figure 2: precision against bias, for the three estimators ───────────────
EST = [('IVW', IVW, IVW_SE),
       ('MR-Egger', EGG_SLOPE, EGG_SE),
       ('weighted median', MEDIAN, 0.0)]

ax2 = Axes(178.0, 470.0, 54.0, 176.0, (-0.10, 0.70), (-0.7, 2.7))
p2 = [ax2.frame()]
p2.append(ax2.xticks([0, 0.2, 0.4, 0.6], ['0', '0.2', '0.4', '0.6']))
p2.append(line(ax2.px(TRUE), ax2.py(-0.7), ax2.px(TRUE), ax2.py(2.7), 1.4, opacity='.5',
               dash='4 3'))
p2.append(text(ax2.px(TRUE), ax2.py(2.7) - 8, 'the true causal effect, 0.30', 10.5,
               anchor='middle', opacity='.75'))

for k, (name, est, se) in enumerate(EST):
    y = ax2.py(2 - k)
    if se > 0:
        p2.append(line(ax2.px(est - 1.96 * se), y, ax2.px(est + 1.96 * se), y, 1.8, opacity='.6'))
        for e in (est - 1.96 * se, est + 1.96 * se):
            p2.append(line(ax2.px(e), y - 5, ax2.px(e), y + 5, 1.8, opacity='.6'))
    hit = abs(est - TRUE) < 0.01
    p2.append(circle(ax2.px(est), y, 6, fill=ACCENT if hit else 'currentColor'))
    p2.append(text(ax2.x0 - 12, y + 4, name, 10.5, anchor='end', weight='600'))
    p2.append(text(ax2.x1 + 12, y + 4, '%.4f' % est, 10.5, weight='600',
                   fill=ACCENT if hit else 'currentColor'))

p2.append(text(30, 244, 'IVW is off by 21.7% because it must pass through the origin and three',
               10.5, opacity='.85'))
p2.append(text(30, 260, 'instruments do not. Egger frees the intercept and lands near the truth,',
               10.5, opacity='.85'))
p2.append(text(30, 276, 'but its interval spans 0 to 0.57. The median needs only that a majority',
               10.5, opacity='.85'))
p2.append(text(30, 292, 'of weight sits on valid instruments — here it does, and it is exact.',
               10.5, opacity='.85'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 216, 'Estimated causal effect (95% CI)', 12,
               anchor='middle'))
p2.append(text(20, 22, 'Three estimators, one dataset: bias and precision trade against each other',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-mendelian-randomization-estimators.svg'),
                           svg(640, 312, ''.join(p2))))
print('  Egger 95%% CI: %.4f to %.4f' % (EGG_SLOPE - 1.96 * EGG_SE, EGG_SLOPE + 1.96 * EGG_SE))
print('  IVW   95%% CI: %.4f to %.4f' % (IVW - 1.96 * IVW_SE, IVW + 1.96 * IVW_SE))
