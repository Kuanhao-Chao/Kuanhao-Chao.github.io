import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

def ncdf(z):
    return 0.5 * math.erfc(-z / math.sqrt(2.0))

# A cell is called inducing when u/s > gamma. Estimating k*gamma instead reverses every cell
# whose ratio lies between the two, which for lognormal ratios about gamma with log-sd sigma is
# |Phi(ln k / sigma) - 1/2|. Every value is recomputed in src/lib/deepDiveExamples.test.ts.
flipped = lambda sigma, k: abs(ncdf(math.log(k) / sigma) - 0.5)
SIGMAS = [(0.25, None), (0.5, '.72'), (0.75, '.5'), (1.0, '.34')]

ax = Axes(112.0, 400.0, 44.0, 232.0, (1.0, 4.0), (0.0, 55.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 10, 20, 30, 40, 50], ['0%', '10%', '20%', '30%', '40%', '50%'],
                  emphasise=(50,)))
o.append(ax.xticks([1, 1.5, 2, 2.5, 3, 3.5, 4],
                   ['1x', '1.5x', '2x', '2.5x', '3x', '3.5x', '4x']))
o.append(text(ax.x1 - 4, ax.py(50.0) - 9, 'half the cells — the most that can flip', 10,
              anchor='end', opacity='.75'))

for sigma, op in SIGMAS:
    o.append(ax.curve(lambda k, sg=sigma: 100 * flipped(sg, k), n=220,
                      width=2.4 if op is None else 1.9,
                      stroke=ACCENT if op is None else 'currentColor', opacity=op))

# the four curves converge at the right edge, so they are named in the margin
o.append(circle(ax.px(2.0), ax.py(100 * flipped(0.5, 2.0)), 4.4, fill='currentColor',
                opacity='.72'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 40,
              'How far the degradation rate is misestimated', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Cells whose arrow points the wrong way', 11, opacity='.8'))

LX = ax.x1 + 30
o.append(text(LX, 52, 'spread of u/s', 9.5, opacity='.6'))
for i, (sigma, op) in enumerate(SIGMAS):
    yy = 70 + 15 * i
    o.append(line(LX, yy - 4, LX + 20, yy - 4,
                  2.4 if op is None else 1.9,
                  stroke=ACCENT if op is None else 'currentColor', opacity=op))
    o.append(text(LX + 28, yy, 'log sd %.2f' % sigma, 10,
                  fill=ACCENT if op is None else 'currentColor', opacity=op,
                  weight='600' if op is None else None))
o.append(text(LX, 148, 'at a two-fold error, log sd 0.50:', 10, opacity='.8'))
o.append(text(LX, 163, '41.7% of arrows reverse', 10, weight='600'))

o.append(text(LX, 190, 'Tighter is worse.', 11, weight='700'))
for i, t in enumerate(['The arrow says "inducing"', 'exactly when u/s exceeds the',
                       'degradation rate, so an error', 'in that rate reverses every',
                       'cell between the two values.', '',
                       'A tightly clustered gene sits', 'almost entirely on one side of',
                       'a shifted threshold, so it', 'inverts more completely, not',
                       'less - the sd 0.25 curve', 'reaches half the cells by a',
                       'three-fold error, and every', 'flipped cell goes the same way.']):
    o.append(text(LX, 208 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-velocity-flip.svg'), svg(772, 392, ''.join(o)))
print('wrote sc-velocity-flip.svg')
