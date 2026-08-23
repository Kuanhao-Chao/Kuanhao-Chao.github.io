import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, rect, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── A credible set that excludes the truth and does not say so ───────────────
# Same summary statistics, same LD, same priors. The only difference is whether the
# causal variant survived the upstream filters. Coverage and purity are equally
# reassuring either way. Every value is asserted in deepDiveExamples.test.ts.
PANELS = [
    ('the causal variant is in the data',
     [0.000000, 0.000021, 0.114882, 0.770194, 0.114882, 0.000021, 0.000000, 0.000000],
     [2, 3, 4], 3, '0.999959', '0.7000'),
    ('it was dropped before fine-mapping',
     [0.000000, 0.000089, 0.499911, None, 0.499911, 0.000089, 0.000000, 0.000000],
     [2, 4], None, '0.999821', '0.7000'),
]

o = []
for pi, (title, pips, cs, causal, cov, pur) in enumerate(PANELS):
    y1 = 128 + pi * 150
    ax = Axes(88.0, 430.0, y1 - 74, y1, (-0.7, 7.7), (0.0, 0.85))
    o.append(ax.frame())
    o.append(ax.ygrid([0.0, 0.4, 0.8], ['0', '0.4', '0.8'], size=9.5))
    o.append(text(20, y1 - 88, title, 11.5, weight='700'))
    for i, v in enumerate(pips):
        x = ax.px(i)
        if v is None:
            o.append(line(x, ax.py(0.0), x, ax.py(0.8), 1.4, opacity='.4', dash='3 3'))
            # Annotations go *below* the axis: above the tallest bar they land on its
            # value label.
            o.append(text(x, ax.py(0.0) + 15, 'absent', 8.5, anchor='middle', opacity='.6'))
            continue
        w = 20
        o.append(rect(x - w / 2, ax.py(v), w, ax.py(0.0) - ax.py(v), rx=2, fill=ACCENT,
                      opacity='0.9' if i in cs else '0.3'))
        if v > 0.05:
            o.append(text(x, ax.py(v) - 5, '%.3f' % v, 8.5, anchor='middle', weight='600'))
        if causal is not None and i == causal:
            o.append(text(x, ax.py(0.0) + 15, 'causal', 8.5, anchor='middle', weight='700',
                          fill=ACCENT))
    o.append(text(ax.x1 + 16, y1 - 44, 'coverage ' + cov, 9.5, opacity='.85'))
    o.append(text(ax.x1 + 16, y1 - 30, 'purity ' + pur, 9.5, opacity='.85'))
    o.append(text(ax.x1 + 16, y1 - 12, '%d variants' % len(cs), 9.5, weight='600', fill=ACCENT))

o.append(text(20, 24, 'Both credible sets look equally trustworthy; one of them is wrong',
              11.5, opacity='.8'))
# The second panel's below-axis annotation sits at 293, so the title clears it.
o.append(text(244, 318, 'Variant', 11, anchor='middle'))
o.append(text(20, 344, 'Removing the causal variant makes the answer look better, not worse: a two-variant',
              10, opacity='.85'))
o.append(text(20, 358, 'set instead of three, the same purity, the same coverage. Nothing in the',
              10, opacity='.85'))
o.append(text(20, 372, 'output reports that the truth was never a candidate.', 10, opacity='.85'))

print('bytes:', write(os.path.join(OUT, 'gwas-fine-mapping-practice-missing-causal.svg'),
                      svg(640, 388, ''.join(o))))
