import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, Axes, ACCENT

# The same 100 predictions, drawn as an ROC curve and a precision-recall curve. Eight
# negatives outrank every positive: ROC barely registers them, precision-recall cannot
# see anything else. Counts match TraitGym's 1:9 design, so the baseline is 0.1.
P, TOP = 10, 8
labels, scores = [], []
for i in range(P):
    labels.append(1); scores.append(0.60 + 0.30 * i / (P - 1))
for j in range(90 - TOP):
    labels.append(0); scores.append(0.55 * j / (90 - TOP - 1))
for k in range(TOP):
    labels.append(0); scores.append(0.92 + 0.07 * k / max(1, TOP - 1))

order = sorted(range(len(scores)), key=lambda i: -scores[i])
nP, nN = sum(labels), len(labels) - sum(labels)
roc, pr = [(0.0, 0.0)], []
tp = fp = 0
for i in order:
    if labels[i]: tp += 1
    else: fp += 1
    roc.append((fp / nN, tp / nP))
    if tp: pr.append((tp / nP, tp / (tp + fp)))

o = []
o.append(text(320, 18, 'The same 100 predictions, two curves', 12, anchor='middle', weight='600'))

axL = Axes(64.0, 288.0, 46.0, 250.0, (0, 1), (0, 1))
o.append(axL.frame())
o.append(axL.ygrid([0, 0.5, 1], ['0', '0.5', '1']))
o.append(axL.xticks([0, 0.5, 1], ['0', '0.5', '1']))
o.append(line(axL.px(0), axL.py(0), axL.px(1), axL.py(1), 1, opacity='.3', dash='4 4'))
o.append('<path d="M' + ' L'.join('%.1f,%.1f' % (axL.px(x), axL.py(y)) for x, y in roc)
         + '" fill="none" stroke="currentColor" stroke-width="2"/>')
o.append(text(176, 36, 'AUROC = 0.9111', 11, anchor='middle', weight='600'))
o.append(text(176, 286, 'False positive rate', 11, anchor='middle'))
o.append(text(20, 148, 'Recall', 11, anchor='middle', extra='transform="rotate(-90 20 148)"'))

axR = Axes(376.0, 600.0, 46.0, 250.0, (0, 1), (0, 1))
o.append(axR.frame())
o.append(axR.ygrid([0, 0.5, 1], ['0', '0.5', '1']))
o.append(axR.xticks([0, 0.5, 1], ['0', '0.5', '1']))
o.append(line(axR.px(0), axR.py(0.1), axR.px(1), axR.py(0.1), 1.5, stroke=ACCENT, dash='5 4'))
o.append(text(axR.px(0.98), axR.py(0.1) - 7, 'baseline 0.1', 10, anchor='end', fill=ACCENT, weight='600'))
o.append('<path d="M' + ' L'.join('%.1f,%.1f' % (axR.px(x), axR.py(y)) for x, y in pr)
         + '" fill="none" stroke="currentColor" stroke-width="2"/>')
# The first precision point sits almost exactly on the baseline, so its label has to be
# lifted clear of the dashed line rather than placed beside the marker.
o.append(circle(axR.px(pr[0][0]), axR.py(pr[0][1]), 4, fill=ACCENT))
o.append(line(axR.px(pr[0][0]), axR.py(pr[0][1]) - 5, axR.px(pr[0][0]) + 14,
              axR.py(0.30) + 4, 1, stroke=ACCENT, opacity='.6'))
o.append(text(axR.px(pr[0][0]) + 18, axR.py(0.30) + 7,
              'first hit is the 9th prediction', 10, fill=ACCENT, weight='600'))
o.append(text(488, 36, 'AUPRC = 0.3782', 11, anchor='middle', weight='600', fill=ACCENT))
o.append(text(488, 286, 'Recall', 11, anchor='middle'))
o.append(text(332, 148, 'Precision', 11, anchor='middle', extra='transform="rotate(-90 332 148)"'))

o.append(text(320, 308, 'Eight negatives outrank every positive; only one curve shows it',
              11, anchor='middle', opacity='.75'))

print('  first precision point:', '%.4f' % pr[0][1], 'at recall', '%.2f' % pr[0][0])
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-variant-benchmarks.svg'),
                      svg(640, 322, ''.join(o))))
