import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# For two equal batches in which a cell type is f1 of one and f2 of the other, the batch/type
# correlation is exactly |f1 - f2|. Per-batch centring keeps 1 - r^2 of the biological
# difference; a correct regression keeps the estimate but inflates its variance by 1/(1 - r^2),
# so the information surviving is 1 - r^2 either way. Every value is recomputed in
# src/lib/deepDiveExamples.test.ts.
keep = lambda r: 1 - r * r
ROWS = [(0.0, '50 / 50'), (0.6, '80 / 20'), (0.8, '90 / 10'), (0.9, '95 / 5'), (0.98, '99 / 1')]

ax = Axes(112.0, 400.0, 44.0, 232.0, (0.0, 1.0), (0.0, 1.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0%', '25%', '50%', '75%', '100%']))
o.append(ax.xticks([0, 0.2, 0.4, 0.6, 0.8, 1.0], ['0', '0.2', '0.4', '0.6', '0.8', '1.0']))
o.append(ax.curve(keep, n=220, width=2.4, stroke=ACCENT))

for r, lab in ROWS:
    o.append(circle(ax.px(r), ax.py(keep(r)), 4.2, fill=ACCENT))

# perfect confounding
o.append(line(ax.px(1.0), ax.py(0.0), ax.px(1.0), ax.py(0.35), 1.4, opacity='.45', dash='4 3'))
# the annotation lives in the empty wedge under the curve, not across it
for i, t in enumerate(['every treated sample in one batch', 'puts r at 1, and nothing survives']):
    o.append(text(ax.px(0.06), ax.py(0.26) + 13 * i, t, 10, opacity='.75'))
o.append(line(ax.px(0.72), ax.py(0.19), ax.px(0.97), ax.py(0.045), 1, opacity='.35'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'Batch–cell-type correlation, which is just |f1 − f2|', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Information about the effect that survives', 11, opacity='.8'))

LX = ax.x1 + 30
o.append(text(LX, 56, 'composition', 9.5, opacity='.6'))
o.append(text(LX + 76, 56, 'kept', 9.5, anchor='end', opacity='.6'))
o.append(text(LX + 148, 56, 'variance x', 9.5, anchor='end', opacity='.6'))
for i, (r, lab) in enumerate(ROWS):
    yy = 74 + 15 * i
    vif = 'infinite' if keep(r) == 0 else '%.2f' % (1 / keep(r))
    o.append(text(LX, yy, lab, 10, opacity='.8'))
    o.append(text(LX + 76, yy, '%.0f%%' % (100 * keep(r)), 10, anchor='end', fill=ACCENT,
                  weight='600'))
    o.append(text(LX + 148, yy, vif, 10, anchor='end', opacity='.8'))

o.append(text(LX, 168, 'One number, two bills.', 11, weight='700'))
for i, t in enumerate(['Centring each batch keeps', '1 - r squared of the real',
                       'difference and silently drops', 'the rest. Regressing the batch',
                       'out keeps the estimate whole', 'and multiplies its variance by',
                       'the reciprocal.', '',
                       'Either way the information', 'that survives is 1 - r squared,',
                       'because that is all the design', 'contains. No integration',
                       'method can return more.']):
    o.append(text(LX, 186 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-confounding-cost.svg'), svg(772, 356, ''.join(o)))
print('wrote sc-confounding-cost.svg')
