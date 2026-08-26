import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

NAMES = ['T cells', 'Monocytes', 'B cells', 'NK cells', 'Other', 'Dendritic']
ABUND_A = [40, 20, 10, 8, 20, 2]
ABUND_B = [20, 10, 5, 4, 10, 1]
BEFORE = [0.40, 0.20, 0.10, 0.08, 0.20, 0.02]
D = 1.2                                    # closure factor for doubling monocytes at p = 0.20
AFTER = [p * (2 if i == 1 else 1) / D for i, p in enumerate(BEFORE)]
# every value here is recomputed from deepDiveMath in src/lib/deepDiveExamples.test.ts

# ── 1 · One population moves; five identical declines follow ────────────────
# Proportions on a log axis, so a constant factor is a constant vertical distance. The five
# unchanged populations therefore draw five *parallel* segments, and that parallelism is the
# theorem: they all fall by exactly 1/D, whatever their own size.
ax = Axes(150.0, 372.0, 44.0, 228.0, (0.0, 1.0), (0.012, 0.55), ylog=True)
o = [line(ax.x0, ax.py(0.012), ax.x0, ax.py(0.55), 1.25),
     line(ax.x1, ax.py(0.012), ax.x1, ax.py(0.55), 1.25)]
for v, lab in ((0.02, '2%'), (0.05, '5%'), (0.1, '10%'), (0.2, '20%'), (0.4, '40%')):
    o.append(line(ax.x0, ax.py(v), ax.x1, ax.py(v), 1, '.12'))
    o.append(text(ax.x0 - 8, ax.py(v) + 4, lab, 10.5, anchor='end', opacity='.75'))
o.append(text(ax.x0, ax.py(0.012) + 20, 'before', 11, anchor='middle', opacity='.8'))
o.append(text(ax.x1, ax.py(0.012) + 20, 'after', 11, anchor='middle', opacity='.8'))

for i, name in enumerate(NAMES):
    up = i == 1
    o.append(path([(ax.x0, ax.py(BEFORE[i])), (ax.x1, ax.py(AFTER[i]))],
                  width=2.4 if up else 1.9, stroke=ACCENT if up else 'currentColor',
                  opacity=None if up else '.55'))
    o.append(circle(ax.x0, ax.py(BEFORE[i]), 3.6, fill=ACCENT if up else 'currentColor',
                    opacity=None if up else '.55'))
    o.append(circle(ax.x1, ax.py(AFTER[i]), 3.6, fill=ACCENT if up else 'currentColor',
                    opacity=None if up else '.55'))
    # T cells and monocytes both land on 1/3 after the change, so their labels are nudged apart
    dy = -6 if up else (15 if i == 0 else 4)
    o.append(text(ax.x1 + 8, ax.py(AFTER[i]) + dy, name, 10,
                  fill=ACCENT if up else 'currentColor', opacity=None if up else '.75',
                  weight='600' if up else None))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.012) + 40,
              'Only the monocytes changed', 12, anchor='middle'))
o.append(text(ax.x0 - 96, 26, 'Share of the sample', 11, opacity='.8'))

LX = ax.x1 + 96
o.append(text(LX, 60, 'Five parallel lines.', 11, weight='700'))
for i, t in enumerate(['Monocytes doubled in absolute', 'number. Nothing else moved at',
                       'all - and every one of the', 'other five falls by the same',
                       'factor, 1/1.2, for a log2', 'change of -0.263034 apiece.', '',
                       'On a log axis a constant', 'factor is a constant distance,',
                       'so those five segments are', 'parallel. That parallelism is',
                       'the whole result.', '',
                       'The monocyte line rises', '0.736966, and the difference', 'is exactly 1.']):
    o.append(text(LX, 78 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-closure-slopes.svg'), svg(772, 300, ''.join(o)))

# ── 2 · Two different experiments, one indistinguishable answer ─────────────
# Bars from zero, as the repo requires. The abundances plainly differ; the percentages do not.
ax = Axes(150.0, 360.0, 44.0, 226.0, (0.0, 45.0), (0.0, 6.6))
o = [line(ax.x0, ax.py(0.0), ax.x0, ax.py(6.6), 1.25)]
for v in (0, 10, 20, 30, 40):
    o.append(line(ax.px(v), ax.py(0.0), ax.px(v), ax.py(6.6), 1, '.12'))
    o.append(text(ax.px(v), ax.py(0.0) + 18, str(v), 11, anchor='middle', opacity='.75'))
for i, name in enumerate(NAMES):
    yy = ax.py(6.0 - i * 1.0)
    o.append(rect(ax.x0, yy - 11, max(0.6, ax.px(ABUND_A[i]) - ax.x0), 10,
                  fill=ACCENT, opacity='.85'))
    o.append(rect(ax.x0, yy + 1, max(0.6, ax.px(ABUND_B[i]) - ax.x0), 10,
                  fill='currentColor', opacity='.45'))
    o.append(text(ax.x0 - 8, yy + 4, name, 10.5, anchor='end'))
    o.append(text(ax.x1 + 10, yy + 4, '%.0f%%' % (100 * BEFORE[i]), 10.5, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'Cells recovered, thousands', 12, anchor='middle'))
o.append(text(ax.x1 + 10, ax.py(6.6) - 2, 'share', 10, opacity='.7'))
o.append(text(ax.x0 + 6, ax.py(6.6) - 2, 'filled = experiment A, faint = experiment B', 10,
              opacity='.7'))

LX = ax.x1 + 66
o.append(text(LX, 62, 'Same answer, twice.', 11, weight='700'))
for i, t in enumerate(['Experiment B recovered half', 'as many cells of every type',
                       'as experiment A. The two bar', 'charts are plainly different.',
                       '', 'They close to the identical',
                       'proportion vector, to the last', 'decimal place - so no statistic',
                       'computed from proportions can', 'tell them apart, and neither',
                       'can any amount of care.', '',
                       'What separates them is a', 'total cell count, which is a',
                       'measurement nobody makes.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-closure-ambiguity.svg'), svg(772, 300, ''.join(o)))
print('wrote sc-closure-slopes.svg, sc-closure-ambiguity.svg')
