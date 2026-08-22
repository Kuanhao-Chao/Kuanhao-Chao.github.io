import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, rect, write, ACCENT

# The five colocalisation hypotheses across three loci. Values come from colocPosteriors in
# src/lib/deepDiveMath.ts and are re-derived in the lesson tests, so bars and prose cannot
# drift. Scenario names head each group rather than sitting beside it: at five bars a row,
# a left-hand label collides with the hypothesis labels.
SCENARIOS = [
    ('Shared causal variant',    'both traits peak at the same variant',
     [0.0000, 0.0000, 0.0000, 0.0000, 1.0000]),
    ('Distinct causal variants', 'the eQTL peak moves by one variant',
     [0.0001, 0.0119, 0.0095, 0.9523, 0.0262]),
    ('Weak eQTL, strong GWAS',   'the eQTL evidence is a single Bayes factor of 25',
     [0.0028, 0.2849, 0.0000, 0.0001, 0.7122]),
]
H = ['H0', 'H1', 'H2', 'H3', 'H4']
X0, X1 = 112.0, 560.0
TOP, BARH, BARGAP, GROUPGAP = 44.0, 12.0, 4.0, 34.0
GROUPH = 18 + 5 * (BARH + BARGAP)

o = [text(320, 18, 'What a colocalisation actually concludes', 12, anchor='middle', weight='600')]
for si, (name, note, pps) in enumerate(SCENARIOS):
    gy = TOP + si * (GROUPH + GROUPGAP)
    o.append(text(64, gy, name, 11.5, weight='600'))
    o.append(text(64 + 8 + len(name) * 6.2, gy, '— ' + note, 10, opacity='.65'))
    for hi, pp in enumerate(pps):
        y = gy + 12 + hi * (BARH + BARGAP)
        w = max(1.2, pp * (X1 - X0))
        shared = hi == 4
        o.append(text(X0 - 8, y + 9.5, H[hi], 9.5, anchor='end', opacity='.7'))
        o.append(rect(X0, y, w, BARH, opacity='.9' if shared else '.28',
                      fill=ACCENT if shared else 'currentColor', rx=2))
        if pp >= 0.005:
            o.append(text(X0 + w + 7, y + 9.5, '%.4f' % pp, 9.5,
                          fill=ACCENT if shared else 'currentColor',
                          weight='600' if shared else None, opacity=None if shared else '.85'))
    print('  %-26s %s' % (name, '  '.join('%.4f' % v for v in pps)))

FOOT = TOP + 3 * (GROUPH + GROUPGAP) - GROUPGAP + 18
o.append(text(320, FOOT, 'H3 and H4 are the whole question: both traits have a signal either way',
              11, anchor='middle', opacity='.75'))
Hgt = int(FOOT + 14)
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-expression-qtl.svg'),
                      svg(640, Hgt, ''.join(o))))
