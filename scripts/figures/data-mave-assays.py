import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, write, circle, Axes, ACCENT

# How much evidence a functional assay can supply is bounded by how many benign controls
# it got right, not by how clean the assay looks. With zero misclassified benign controls
# the Wilson upper bound on the false-positive rate is z^2/(n + z^2), so the largest
# defensible likelihood ratio is TPR (n + z^2) / z^2 — linear in the number of controls.
Z2 = 1.959963984540054 ** 2
TPR = 0.9
bound = lambda n: TPR * (n + Z2) / Z2
TIERS = [('supporting', 350 ** (1 / 8), 6), ('moderate', 350 ** (1 / 4), 15),
         ('strong', 350 ** (1 / 2), 77), ('very strong', 350.0, 1491)]

ax = Axes(80.0, 596.0, 40.0, 268.0, (3, 3000), (1, 1000), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([1, 10, 100, 1000], ['1', '10', '100', '1,000']))
o.append(ax.xticks([3, 10, 30, 100, 300, 1000, 3000], ['3', '10', '30', '100', '300', '1k', '3k']))

for name, lr, n in TIERS:
    o.append(line(ax.x0, ax.py(lr), ax.x1, ax.py(lr), 1, stroke=ACCENT, opacity='.45', dash='5 4'))
    o.append(text(ax.x0 + 6, ax.py(lr) - 5, '%s — LR %.4g' % (name, lr), 9.5, fill=ACCENT, opacity='.9'))

o.append(ax.curve(bound, n=200, width=2))

for name, lr, n in TIERS:
    o.append(circle(ax.px(n), ax.py(lr), 4, fill=ACCENT))
    o.append(text(ax.px(n), ax.py(lr) + 16, '%d' % n, 10.5, anchor='middle', fill=ACCENT, weight='600'))
    print('  %-12s LR %8.4f at n = %5d   (achieved %.4f)' % (name, lr, n, bound(n)))

o.append(text(ax.px(11), ax.py(1.35), 'ten controls cannot exceed supporting', 10, opacity='.8'))
o.append(text(ax.px(300), ax.py(2.2),
              'each tier costs several times the controls of the one below', 10, anchor='middle', opacity='.7'))

o.append(text((ax.x0 + ax.x1) / 2, 300, 'Benign controls classified correctly, all of them (log scale)', 12, anchor='middle'))
o.append(text(18, 154, 'Largest defensible LR+', 12, anchor='middle',
              extra='transform="rotate(-90 18 154)"'))
o.append(text((ax.x0 + ax.x1) / 2, 20,
              'An assay that never misclassifies a control is still limited by how many it had',
              11.5, anchor='middle', opacity='.8'))

print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-mave-assays.svg'),
                      svg(640, 314, ''.join(o))))
