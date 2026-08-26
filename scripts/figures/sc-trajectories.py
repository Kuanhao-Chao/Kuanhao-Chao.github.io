import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# A trajectory with a fast opening, a ten-fold slower bottleneck and a fast finish. At steady
# state the cell density is lambda/v(s), so the share of cells in a stretch equals the share of
# real time spent crossing it. Every value is recomputed in src/lib/deepDiveExamples.test.ts.
SEGS = [('early', 0.0, 0.3, 1.0), ('bottleneck', 0.3, 0.5, 0.1), ('late', 0.5, 1.0, 1.0)]
TOT_T = sum((b - a) / v for _, a, b, v in SEGS)

# ── Two rulers over one axis ────────────────────────────────────────────────
ax = Axes(112.0, 400.0, 44.0, 190.0, (0.0, 1.0), (0.0, 4.0))
o = []
for v in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
    o.append(line(ax.px(v), ax.py(0.2), ax.px(v), ax.py(3.6), 1, '.10'))
    o.append(text(ax.px(v), ax.py(0.2) - 6, '%.1f' % v, 10.5, anchor='middle', opacity='.7'))

# row 1: the pseudotime axis itself — equal spacing is arc length
o.append(text(ax.x0 - 8, ax.py(3.0) + 4, 'pseudotime axis', 10.5, anchor='end'))
for name, a, b, v in SEGS:
    accent = name == 'bottleneck'
    o.append(rect(ax.px(a), ax.py(3.0) - 11, ax.px(b) - ax.px(a), 22,
                  fill=ACCENT if accent else 'currentColor', opacity='.85' if accent else '.3'))
    o.append(text((ax.px(a) + ax.px(b)) / 2, ax.py(3.0) + 4, '%d%%' % round(100 * (b - a)),
                  10.5, anchor='middle',
                  fill='var(--color-bg, #fff)' if accent else 'currentColor'))

# row 2: the same three stretches, drawn in proportion to how long they really take
o.append(text(ax.x0 - 8, ax.py(1.4) + 4, 'real elapsed time', 10.5, anchor='end'))
o.append(text(ax.x0 - 8, ax.py(1.4) + 17, '= share of cells', 9.5, anchor='end', opacity='.65'))
cursor = 0.0
for name, a, b, v in SEGS:
    frac = ((b - a) / v) / TOT_T
    accent = name == 'bottleneck'
    o.append(rect(ax.px(cursor), ax.py(1.4) - 11, ax.px(cursor + frac) - ax.px(cursor), 22,
                  fill=ACCENT if accent else 'currentColor', opacity='.85' if accent else '.3'))
    o.append(text((ax.px(cursor) + ax.px(cursor + frac)) / 2, ax.py(1.4) + 4,
                  '%.1f%%' % (100 * frac), 10.5, anchor='middle',
                  fill='var(--color-bg, #fff)' if accent else 'currentColor'))
    cursor += frac

# tie the bottleneck's two representations together
o.append(line(ax.px(0.3), ax.py(3.0) - 13, ax.px(0.107143), ax.py(1.4) + 13, 1, opacity='.35',
              dash='3 3'))
o.append(line(ax.px(0.5), ax.py(3.0) - 13, ax.px(0.821429), ax.py(1.4) + 13, 1, opacity='.35',
              dash='3 3'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.2) + 34, 'the same three stretches, twice', 12,
              anchor='middle'))

LX = ax.x1 + 30
o.append(text(LX, 60, 'The axis is not a clock.', 11, weight='700'))
for i, t in enumerate(['The bottleneck is 20% of the', 'pseudotime axis and 71.4% of',
                       'the elapsed time - a factor', 'of 3.57 between the ruler you',
                       'are handed and the one you', 'wanted.', '',
                       'But the cells count it for', 'you. At steady state the',
                       'density is the entry rate over', 'the speed, so the share of',
                       'cells in a stretch IS the', 'share of time spent there,',
                       'exactly.', '',
                       'The information is in the', 'crowding, which most pipelines',
                       'discard as sampling.']):
    o.append(text(LX, 78 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-pseudotime-rulers.svg'), svg(772, 330, ''.join(o)))
print('wrote sc-pseudotime-rulers.svg')
