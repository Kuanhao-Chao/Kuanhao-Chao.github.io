import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── A scree plot cannot be read without knowing where noise stops ────────────
# Both series below are 400 observations of 60 features. One is pure noise; the other has a
# single two-group structure planted in fifteen of the features. The eigenvalues are not
# simulated here -- they are the exact output of covarianceMatrix + symmetricEigenvalues on
# the deterministic generator used in src/lib/deepDiveMath.test.ts, pasted as literals so
# the drawing and the test cannot drift apart. Every value is asserted in
# src/lib/deepDiveExamples.test.ts.
MP_UPPER = 1.924597
NOISE = [1.9272, 1.8342, 1.7819, 1.7501, 1.6850, 1.6621, 1.6296, 1.5582, 1.4986, 1.4836,
         1.4679, 1.3943, 1.3477, 1.3153, 1.3103, 1.2904, 1.2465, 1.2364, 1.1751, 1.1578]
SIGNAL = [22.4300, 1.8342, 1.7436, 1.7141, 1.6196, 1.5956, 1.5745, 1.5281, 1.5178, 1.4702,
          1.4122, 1.3971, 1.3767, 1.3291, 1.3153, 1.2596, 1.2558, 1.2393, 1.2250, 1.1952]

ax = Axes(112.0, 424.0, 44.0, 232.0, (1.0, 20.0), (1.0, 30.0), ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([1, 2, 5, 10, 30], ['1', '2', '5', '10', '30'], size=10))
o.append(ax.xticks([1, 5, 10, 15, 20], ['1', '5', '10', '15', '20']))

# the edge, drawn first so both series read against it
o.append(line(ax.x0, ax.py(MP_UPPER), ax.x1, ax.py(MP_UPPER), 2.0, opacity='.8', dash='6 4'))
o.append(text(ax.x1 - 4, ax.py(MP_UPPER) - 9, 'Marchenko-Pastur edge, 1.92', 10,
              anchor='end', opacity='.8'))

o.append(path([(ax.px(i + 1), ax.py(v)) for i, v in enumerate(SIGNAL)], width=2.6,
              stroke=ACCENT))
# noise drawn last and dashed: past the first component the two series coincide, and a
# solid curve underneath a solid curve reads as one curve
o.append(path([(ax.px(i + 1), ax.py(v)) for i, v in enumerate(NOISE)], width=1.8,
              stroke='currentColor', opacity='.85', dash='5 3'))
for i, v in enumerate(SIGNAL[:3]):
    o.append(circle(ax.px(i + 1), ax.py(v), 3.4, fill=ACCENT))

o.append(text(ax.px(1.35), ax.py(22.43), '22.43', 10.5, fill=ACCENT, weight='600'))
# the empty band above the edge and right of the spike is the only clear place for this
o.append(text(ax.px(9.0), ax.py(5.2), 'noise peaks at 1.93, just over the edge', 10,
              anchor='middle', opacity='.75'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(1.0) + 40, 'Component', 12, anchor='middle'))
o.append(text(ax.x0 - 90, 26, 'Eigenvalue', 11, opacity='.8'))

LX = ax.x1 + 26
for i, (lab, col, op, dash) in enumerate((('one planted structure', ACCENT, None, None),
                                    ('pure noise', 'currentColor', '.85', '5 3'))):
    yy = 58 + 17 * i
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.2, stroke=col, opacity=op, dash=dash))
    o.append(text(LX + 30, yy, lab, 10, fill=col, opacity=op,
                  weight='600' if col == ACCENT else None))

o.append(text(LX, 110, 'The elbow is not the cut.', 11, weight='700'))
for i, t in enumerate(['Both series are 400 samples', 'of 60 features. The noise one',
                       'has an elbow, a shoulder and', 'a long tail - every feature a',
                       'scree plot is read for - and', 'no structure whatsoever.', '',
                       'Its first component still', 'carries 3.22% of the variance,',
                       'which is the range people', 'routinely keep down to.', '',
                       'The planted structure is 11.7', 'times the edge. Nothing else',
                       'in either series clears it.']):
    o.append(text(LX, 128 + 13 * i, t, 10, opacity='.8'))

write(os.path.join(OUT, 'sc-scree-mp.svg'), svg(772, 336, ''.join(o)))
print('wrote sc-scree-mp.svg')
