import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')
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
