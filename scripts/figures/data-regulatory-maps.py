import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, rect, write, circle, Axes, ACCENT

# Enrichment and significance are different questions, and a large background makes them
# come apart. Each point is a hypothetical annotation: x is fold enrichment, y is the
# one-sided Fisher p-value. The same threefold enrichment is decisive at 500 variants and
# unremarkable at 12.
POINTS = [
    (3,   500, 'cCREs, 500 variants',  True),
    (3,    50, 'cCREs, 50 variants',   False),
    (3,    12, 'cCREs, 12 variants',   False),
    (1.4, 500, 'weak, 500 variants',   False),
]
BG = 0.08

def fisher_p(a, b, c, d):
    lg = math.lgamma
    ch = lambda n, k: lg(n + 1) - lg(k + 1) - lg(n - k + 1)
    n, row, col = a + b + c + d, a + b, a + c
    den = ch(n, row)
    return min(1.0, sum(math.exp(ch(col, x) + ch(n - col, row - x) - den)
                        for x in range(a, min(row, col) + 1)))

# ylog is not optional here: without it every p below 0.05 collapses onto the axis.
ax = Axes(80.0, 500.0, 40.0, 250.0, (1, 5), (1e-30, 1), ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([1e-30, 1e-20, 1e-10, 1e-2, 1],
                  ['1e-30', '1e-20', '1e-10', '0.01', '1']))
o.append(ax.xticks([1, 2, 3, 4, 5], ['1x', '2x', '3x', '4x', '5x']))
o.append(line(ax.x0, ax.py(0.05), ax.x1, ax.py(0.05), 1.25, stroke=ACCENT, dash='5 4'))
o.append(text(ax.x1 - 6, ax.py(0.05) - 7, 'p = 0.05', 10, anchor='end', fill=ACCENT, weight='600'))

for fold, total, label, hi in POINTS:
    a = round(total * BG * fold)
    p = max(fisher_p(a, total - a, round(10000 * BG), 10000 - round(10000 * BG)), 1e-30)
    o.append(circle(ax.px(fold), ax.py(p), 5, fill=ACCENT if hi else 'currentColor',
                    opacity=None if hi else '.55'))
    # points crowd near p = 1, so labels there drop below the marker
    dy = 16 if p > 1e-2 else 4
    o.append(text(ax.px(fold) + 10, ax.py(p) + dy, '%s — p %s' % (label, ('%.1e' % p)), 10,
                  fill=ACCENT if hi else 'currentColor', weight='600' if hi else None,
                  opacity=None if hi else '.8'))
    print('  %-24s a=%-4d fold %.1f  p %.3e' % (label, a, fold, p))

o.append(text((ax.x0 + ax.x1) / 2, 290, 'Fold enrichment over background coverage', 12, anchor='middle'))
o.append(text(18, 145, 'Fisher p-value', 12, anchor='middle', extra='transform="rotate(-90 18 145)"'))
o.append(text((ax.x0 + ax.x1) / 2, 20,
              'The same enrichment, four studies: significance is mostly about how many variants',
              11.5, anchor='middle', opacity='.8'))
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-regulatory-maps.svg'),
                      svg(640, 304, ''.join(o))))
