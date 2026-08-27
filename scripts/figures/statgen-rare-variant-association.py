import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-rare-variant-association.mdx')
K = 39.600989007          # (z_alpha/2 + z_beta)^2 at 5e-8 and 80% power, from lesson 9

# ── Figure 1: the power cliff, and what aggregation buys back ────────────────
BETA = 0.5                # half a phenotypic SD per allele: an enormous effect
q2 = lambda p: 2 * p * (1 - p) * BETA ** 2
need = lambda p: K / q2(p)

ax = Axes(96.0, 430.0, 46.0, 246.0, (1e-5, 0.1), (1e3, 1e8), xlog=True, ylog=True)
o = [ax.frame()]
o.append(ax.ygrid([1e3, 1e4, 1e5, 1e6, 1e7, 1e8],
                  ['1k', '10k', '100k', '1M', '10M', '100M']))
o.append(ax.xticks([1e-5, 1e-4, 1e-3, 1e-2, 1e-1],
                   ['0.001%', '0.01%', '0.1%', '1%', '10%']))
o.append(ax.curve(need, n=240, width=2))

# Aggregating twenty such variants multiplies the effective frequency. Drawn only across
# the rare range it applies to — past 1% these are not rare variants and nobody collapses
# them — and clipped to the frame, since the aggregated requirement falls below the floor.
pts = []
for i in range(241):
    pm = 10 ** (math.log10(1e-5) + (math.log10(0.01) - math.log10(1e-5)) * i / 240)
    v = need(pm * 20)
    if 1e3 <= v <= 1e8:
        pts.append((ax.px(pm), ax.py(v)))
o.append(path(pts, width=2, stroke=ACCENT, dash='7 4'))

for p, lab in ((1e-4, None), (1e-3, None)):
    o.append(circle(ax.px(p), ax.py(need(p)), 4.5, fill='currentColor'))
o.append(text(ax.px(1.3e-4), ax.py(need(1e-4)) - 10, '792,099 people', 10.5, weight='600'))
o.append(text(ax.px(1.3e-3), ax.py(need(1e-3)) - 10, '79,282', 10.5, weight='600'))

LX = ax.x1 + 14
o.append(line(LX, 74, LX + 20, 74, 2))
o.append(text(LX + 27, 78, 'one variant', 10.5, weight='600'))
for i, t in enumerate(['at β = 0.5 SD per allele —', 'an enormous effect']):
    o.append(text(LX, 96 + 13 * i, t, 10, opacity='.85'))
o.append(line(LX, 138, LX + 20, 138, 2, stroke=ACCENT, dash='7 4'))
o.append(text(LX + 27, 142, 'twenty aggregated', 10.5, weight='600', fill=ACCENT))
for i, t in enumerate(['into one test, so the', 'effective frequency is', 'twenty times higher']):
    o.append(text(LX, 160 + 13 * i, t, 10, opacity='.85'))
for i, t in enumerate(['Aggregation is not a', 'refinement. Below about', '0.1% it is the only way',
                       'the test exists at all.']):
    o.append(text(LX, 216 + 13 * i, t, 10, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 288, 'Minor allele frequency (log scale)', 12, anchor='middle'))
o.append(text(20, 146, 'People needed for 80% power', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 146)"'))
o.append(text(20, 22, 'The power cliff: why rare variants cannot be tested one at a time',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-rare-variant-association-cliff.svg'),
                           svg(640, 302, ''.join(o))))
for p in (1e-4, 1e-3, 1e-2, 5e-2):
    print('   MAF %-8s q2 %.4e  N %s' % (p, q2(p), format(math.ceil(need(p)), ',')))

# ── Figure 2: two genes with the same scores, opposite conclusions ───────────
MAF = [0.001, 0.002, 0.005, 0.008, 0.010]
W = [25 * (1 - m) ** 24 for m in MAF]
GENES = [('gene A — every variant pushes the same way', [4, 3, 5, 2, 3]),
         ('gene B — directions mixed', [4, -3, 5, -2, -3])]

def burden(S):
    return sum(w * s for w, s in zip(W, S)) ** 2

def skat(S):
    return sum(w * w * s * s for w, s in zip(W, S))

o2 = []
o2.append(text(20, 22, 'Same five variants, same weights, same magnitudes — only the signs differ',
               11.5, opacity='.8'))
for g, (title, S) in enumerate(GENES):
    top = 58 + g * 138
    o2.append(text(30, top, title, 11, weight='700'))
    ax2 = Axes(150.0, 360.0, top + 14, top + 82, (-0.7, 4.7), (-5.5, 5.5))
    o2.append(line(ax2.x0, ax2.py(0), ax2.x1, ax2.py(0), 1, opacity='.45'))
    bw = 26
    for j, s in enumerate(S):
        x = ax2.px(j)
        y0, y1 = ax2.py(0), ax2.py(s)
        o2.append(rect(x - bw / 2, min(y0, y1), bw, abs(y1 - y0),
                       fill=ACCENT if s > 0 else 'currentColor',
                       opacity=None if s > 0 else '.55'))
        o2.append(text(x, y1 + (-5 if s > 0 else 13), '%+d' % s, 9.5, anchor='middle'))
    o2.append(text(ax2.x0 - 12, ax2.py(0) + 4, 'score Sⱼ', 10, anchor='end', opacity='.8'))

    b, k = burden(S), skat(S)
    o2.append(text(392, top + 22, 'burden  Q = (Σ wⱼSⱼ)²', 10.5, weight='600'))
    o2.append(text(392, top + 38, '%s' % format(round(b), ','), 12, weight='700',
                   fill=ACCENT if b > k else 'currentColor'))
    o2.append(text(392, top + 62, 'SKAT  Q = Σ wⱼ²Sⱼ²', 10.5, weight='600'))
    o2.append(text(392, top + 78, '%s' % format(round(k), ','), 12, weight='700',
                   fill=ACCENT if k > b else 'currentColor'))

o2.append(text(30, 334, 'Burden collapses by a factor of 106.6 when the directions mix.', 10.5,
               opacity='.85'))
o2.append(text(30, 350, 'SKAT does not move at all — 32,097 either way — because squaring each', 10.5,
               opacity='.85'))
o2.append(text(30, 366, 'score before summing erases sign entirely. SKAT-O mixes the two.', 10.5,
               opacity='.85'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-rare-variant-association-burden.svg'),
                           svg(640, 384, ''.join(o2))))
for title, S in GENES:
    print('   %-46s burden %12s   SKAT %10s' % (title, format(round(burden(S)), ','),
                                                format(round(skat(S)), ',')))
print('   burden ratio A/B %.1f   SKAT ratio A/B %.3f'
      % (burden(GENES[0][1]) / burden(GENES[1][1]), skat(GENES[0][1]) / skat(GENES[1][1])))


# ── Figure 3 ── where the normal approximation stops being an approximation ──
# One rare variant carried by 30 people, 5,000 cases against 400,000 controls. Under the
# null the number of carriers who are cases is Binomial(30, 0.012346); the score test's
# normal approximation standardises it and reads the normal tail. The two tails are drawn
# together. Values are exact binomial and normal tail areas, asserted in
# src/lib/deepDiveExamples.test.ts.
EXACT = [0.3111, 0.05278, 0.005955, 4.925e-4, 3.159e-5, 1.630e-6, 6.935e-8, 2.479e-9]
NORMAL = [0.2979, 7.051e-3, 1.375e-5, 1.958e-9, 1.938e-14, 1.302e-20, 5.854e-28, 1.748e-36]
EXOME = 2.5e-6

a3 = Axes(104.0, 424.0, 40.0, 236.0, (1, 8), (1e-12, 1.0), ylog=True)
q = [a3.frame()]
q.append(a3.ygrid([1e-12, 1e-9, 1e-6, 1e-3, 1.0],
                  ['10' + '\u207b\u00b9\u00b2', '10' + '\u207b\u2079', '10' + '\u207b\u2076',
                   '10' + '\u207b\u00b3', '1'], size=10))
q.append(a3.xticks(list(range(1, 9)), [str(i) for i in range(1, 9)], size=10))

q.append(line(a3.x0, a3.py(EXOME), a3.x1, a3.py(EXOME), 2.0, opacity='.55'))
q.append(text(a3.x1 - 4, a3.py(EXOME) - 8, 'exome-wide 2.5\u00d710' + '\u207b\u2076', 10,
              anchor='end', opacity='.8'))

for vals, stroke, dash, w, op in ((NORMAL, 'currentColor', '5 3', 2.0, '.8'),
                                  (EXACT, ACCENT, None, 2.6, None)):
    pts = [(a3.px(i + 1), a3.py(max(v, 1e-12))) for i, v in enumerate(vals) if v >= 1e-12]
    q.append(path(pts, width=w, stroke=stroke, dash=dash, opacity=op))
    for x0, y0 in pts:
        q.append(circle(x0, y0, 3.2, fill=stroke if stroke == ACCENT else 'currentColor',
                        opacity=None if stroke == ACCENT else op))

# where each test fires
q.append(circle(a3.px(4), a3.py(NORMAL[3]), 5.6, fill=None, stroke='currentColor', sw=1.8))
q.append(text(a3.px(4) + 8, a3.py(NORMAL[3]), 'the normal test fires here', 10, opacity='.85'))
q.append(circle(a3.px(6), a3.py(EXACT[5]), 5.6, fill=None, stroke=ACCENT, sw=2.0))
q.append(text(a3.px(6) - 8, a3.py(EXACT[5]) - 10, 'the exact test needs six', 10,
              anchor='end', fill=ACCENT, weight='600'))

q.append(text((a3.x0 + a3.x1) / 2, a3.py(1e-12) + 42,
              'Carriers who are cases, out of 30', 12, anchor='middle'))
q.append(text(a3.x0 - 78, 24, 'Probability under the null', 10.5, opacity='.85'))

LX3 = a3.x1 + 30
q.append(line(LX3, 36, LX3 + 22, 36, 2.6, stroke=ACCENT))
q.append(text(LX3 + 30, 40, 'exact (binomial)', 10, fill=ACCENT, weight='600'))
q.append(line(LX3, 53, LX3 + 22, 53, 2.0, stroke='currentColor', dash='5 3', opacity='.8'))
q.append(text(LX3 + 30, 57, 'what the score test claims', 10, opacity='.8'))

q.append(text(LX3, 88, 'A tail failure, invisible', 11, weight='700'))
q.append(text(LX3, 102, 'at conventional levels.', 11, weight='700'))
for i, t in enumerate([
        'At the nominal 0.05 the normal',
        'approximation is fine - true size',
        '0.053, a factor of 1.06.', '',
        'In the tail it is not. The two',
        'curves are together at one carrier',
        'case and 250,000 times apart at',
        'four.', '',
        'So the score test fires whenever',
        'four of the thirty carriers are',
        'cases, which really happens with',
        'probability 4.9\u00d710' + '\u207b\u2074 - 197 times the',
        'threshold it thinks it is using.',
        'The exact test needs six.', '',
        'A pilot at 0.05 would never show',
        'this, which is what makes it',
        'dangerous at exome scale.']):
    q.append(text(LX3, 124 + 13 * i, t, 10, opacity='.8'))

_spa = svg(772, 400, ''.join(q))
print('fig3 bytes:', write(os.path.join(OUT, 'statgen-spa-tail.svg'), _spa))
splice(MDX, 2, _spa)
