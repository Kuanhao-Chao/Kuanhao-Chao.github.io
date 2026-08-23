import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── One locus, three encodings, two truths ───────────────────────────────────
# The additive test is not the most powerful encoding at every locus — it is the one that
# is never far off. Under a recessive truth the recessive test wins by a wide margin and
# the additive test still keeps 67.2% of it, which is why a scan runs additive only.
# Every number is asserted in src/lib/deepDiveExamples.test.ts.
PANELS = [
    ('truth is additive', [('additive', 86.2613), ('dominant', 54.2636), ('recessive', 65.0316)]),
    ('truth is recessive', [('additive', 152.6291), ('dominant', 42.1547), ('recessive', 226.9868)]),
]
THRESH = 29.7168
THRESH3 = 31.8486

o = []
for pi, (title, bars) in enumerate(PANELS):
    y0 = 60 + pi * 132
    ax = Axes(150.0, 470.0, y0, y0 + 76.0, (0.0, 240.0), (-0.6, 2.6))
    o.append(ax.frame())
    o.append(ax.xticks([0, 50, 100, 150, 200], ['0', '50', '100', '150', '200']))
    o.append(text(20, y0 - 14, title, 11.5, weight='700'))
    best = max(v for _, v in bars)
    for k, (lab, v) in enumerate(bars):
        yy = ax.py(2 - k)
        o.append(rect(ax.px(0), yy - 8, ax.px(v) - ax.px(0), 16, rx=2, fill=ACCENT,
                      opacity='0.9' if v == best else '0.35'))
        o.append(text(ax.x0 - 10, yy + 4, lab, 10, anchor='end'))
        o.append(text(ax.px(v) + 7, yy + 4, '%.1f' % v, 9.5, weight='600', fill=ACCENT))
    o.append(line(ax.px(THRESH), ax.py(-0.6), ax.px(THRESH), ax.py(2.6), 1.3,
                  opacity='.55', dash='4 3'))

o.append(text(150.0, 46.0, 'threshold 29.72', 9, opacity='.7'))
o.append(text(310.0, 330.0, 'Association statistic (chi-square, 1 df)', 12, anchor='middle'))
o.append(text(20, 24, 'The additive encoding is never the worst, and rarely far from the best',
              11.5, opacity='.8'))
o.append(text(20, 356, 'Under a recessive truth the recessive test wins — and the additive test',
              10, opacity='.85'))
o.append(text(20, 370, 'still keeps 67.2% of it, at 152.6 against 227.0. Running all three',
              10, opacity='.85'))
o.append(text(20, 384, 'instead raises the bar from 29.72 to 31.85 at every locus in the genome.',
              10, opacity='.85'))

print('bytes:', write(os.path.join(OUT, 'gwas-running-the-scan-encodings.svg'),
                      svg(640, 400, ''.join(o))))
print('  additive/recessive under recessive truth: %.1f%%' % (100 * 152.6291 / 226.9868))
