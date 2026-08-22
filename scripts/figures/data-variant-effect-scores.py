import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, path, Axes, ACCENT

# Evidence strength lives on rays through the origin of the ROC plane, because LR+ = TPR/FPR
# is the slope of the line joining the operating point to (0,0). Discrimination — the area
# under the curve — is a property of the whole curve and says nothing about which ray the
# chosen threshold happens to land on.
TIERS = [('supporting', 350 ** (1 / 8)), ('moderate', 350 ** (1 / 4)),
         ('strong', 350 ** (1 / 2)), ('very strong', 350.0)]
FPR, TPR = 0.28, 0.88
LR = TPR / FPR
# One ROC curve through that point, of the form TPR = FPR^a, so AUC = 1/(1+a).
A = math.log(TPR) / math.log(FPR)
AUC = 1 / (1 + A)

ax = Axes(96.0, 396.0, 44.0, 344.0, (0, 1), (0, 1))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.5', '0.75', '1']))
o.append(ax.xticks([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.5', '0.75', '1']))

# chance
o.append(line(ax.px(0), ax.py(0), ax.px(1), ax.py(1), 1, opacity='.3', dash='4 4'))
o.append(text(ax.px(0.62), ax.py(0.58), 'chance, LR = 1', 10, opacity='.55'))

# iso-LR rays. Every ray leaves through TPR = 1, so labelling them where they exit stacks
# all four on top of each other — they go in a legend in the lower right instead, which is
# the one region of a ROC plane that is always empty.
for name, lr in TIERS:
    o.append(line(ax.px(0), ax.py(0), ax.px(min(1.0, 1.0 / lr)), ax.py(1.0), 1.25,
                  stroke=ACCENT, opacity='.75'))

# the ROC curve
o.append(ax.curve(lambda x: x ** A if x > 0 else 0.0, n=200, width=2, opacity='.85'))

# the operating point
o.append(circle(ax.px(FPR), ax.py(TPR), 5, fill=ACCENT))
o.append(line(ax.px(FPR), ax.py(TPR), ax.px(FPR), ax.py(0), 1, opacity='.3', dash='3 3'))
o.append(text(ax.px(FPR) + 9, ax.py(TPR) + 16,
              'threshold here: TPR %.2f, FPR %.2f' % (TPR, FPR), 10.5, weight='600'))
o.append(text(ax.px(FPR) + 9, ax.py(TPR) + 29, 'LR+ = %.2f — supporting' % LR, 10.5,
              fill=ACCENT, weight='600'))

# legend, in the empty triangle below the diagonal
LY = [0.36, 0.30, 0.24, 0.18]   # four tiers; the predictor row goes below them
for (name, lr), y in zip(TIERS, LY):
    o.append(line(ax.px(0.47), ax.py(y), ax.px(0.55), ax.py(y), 1.5, stroke=ACCENT, opacity='.75'))
    o.append(text(ax.px(0.575), ax.py(y) + 3.5, '%s — LR %.4g' % (name, lr), 10,
                  fill=ACCENT, weight='600'))
PRED_Y = LY[-1] - 0.06
o.append(line(ax.px(0.47), ax.py(PRED_Y), ax.px(0.55), ax.py(PRED_Y), 2, opacity='.85'))
o.append(text(ax.px(0.575), ax.py(PRED_Y) + 3.5, 'the predictor, AUC %.3f' % AUC, 10,
              weight='600', opacity='.85'))

o.append(text(ax.px(0.5), 372, 'False positive rate', 12, anchor='middle'))
o.append(text(20, 194, 'True positive rate', 12, anchor='middle',
              extra='transform="rotate(-90 20 194)"'))
o.append(text(320, 20, 'Evidence strength is a ray from the origin, not an area under the curve',
              11.5, anchor='middle', opacity='.8'))

print('  AUC = %.6f   LR+ = %.6f' % (AUC, LR))
for n, lr in TIERS: print('  %-12s LR %.6f  reaches TPR=1 at FPR %.6f' % (n, lr, 1 / lr))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-variant-effect-scores.svg'),
                      svg(640, 386, ''.join(o))))
