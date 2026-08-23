import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── What is left of fifty thousand people ────────────────────────────────────
# Three decisions from three different lessons, none of them mistakes, each charged
# against the same study. The last bar is what one variant imputed at INFO 0.55 is
# actually worth. Every value is asserted in src/lib/deepDiveExamples.test.ts.
STAGES = [
    ('people recruited', 50000.0, ''),
    ('after the 4:1 imbalance', 32000.0, 'lesson 1'),
    ('after relatedness pruning', 31935.48, 'lesson 3'),
    ('at a variant imputed 0.55', 17564.52, 'lesson 2'),
]

ax = Axes(210.0, 452.0, 56.0, 190.0, (0.0, 52000.0), (-0.6, 3.6))
o = [ax.frame()]
o.append(ax.xticks([0, 10000, 20000, 30000, 40000, 50000],
                   ['0', '10k', '20k', '30k', '40k', '50k']))
for k, (lab, v, src) in enumerate(STAGES):
    y = ax.py(3 - k)
    o.append(rect(ax.px(0), y - 11, ax.px(v) - ax.px(0), 22, rx=2, fill=ACCENT,
                  opacity='0.9' if k == len(STAGES) - 1 else '0.35'))
    o.append(text(ax.x0 - 10, y + 4, lab, 10, anchor='end'))
    o.append(text(ax.px(v) + 8, y + 4, format(int(round(v)), ','), 9.5, weight='600',
                  fill=ACCENT))
    if src:
        o.append(text(ax.x0 - 10, y + 15, src, 8, anchor='end', opacity='.55'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(-0.6) + 42, 'Effective sample size', 12,
              anchor='middle'))
o.append(text(20, 24, 'The same study, counted at four points in the pipeline', 11.5,
              opacity='.8'))
o.append(text(20, 252, 'None of the three steps is a mistake. The imbalance was a recruitment',
              10, opacity='.85'))
o.append(text(20, 266, 'decision, the pruning was required, and the variant is imputed as well as',
              10, opacity='.85'))
o.append(text(20, 280, 'the panel allows. Together they leave 35.1% of the headcount — and the',
              10, opacity='.85'))
o.append(text(20, 294, 'power calculation in the grant used 50,000.', 10, opacity='.85'))

print('bytes:', write(os.path.join(OUT, 'gwas-pipeline-erosion.svg'), svg(640, 310, ''.join(o))))
print('  final share of headcount: %.4f%%' % (100 * 17564.52 / 50000))
