import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: where the chi-square test of HWE stops being usable ─────────────
# A cohort of fixed size, scanned across minor allele frequency with genotype counts held
# at exact Hardy-Weinberg proportions except for one extra minor homozygote. Both tests see
# the same table; only one of them is still correct once the expected count falls below a
# handful.
N = 1000

def hwe_expected(aa, ab, bb):
    n = aa + ab + bb
    q = (2 * bb + ab) / (2 * n)
    p = 1 - q
    return n * p * p, n * 2 * p * q, n * q * q

def chi2(aa, ab, bb):
    e = hwe_expected(aa, ab, bb)
    return sum(0.0 if x == 0 else (o - x) ** 2 / x for o, x in zip((aa, ab, bb), e))

def chi2_tail(x):
    # upper tail of chi-square on 1 df = erfc(sqrt(x/2))
    return math.erfc(math.sqrt(x / 2))

def hwe_exact(aa, ab, bb):
    """Wigginton, Cutler & Abecasis (2005), the same recursion as deepDiveMath.ts."""
    n = aa + ab + bb
    rare = 2 * min(aa, bb) + ab
    probs = [0.0] * (rare + 1)
    mid = int((rare * (2 * n - rare)) / (2 * n))
    if mid % 2 != rare % 2:
        mid += 1
    probs[mid] = 1.0
    total = 1.0
    hets, homR = mid, (rare - mid) // 2
    homC = n - hets - homR
    while hets >= 2:
        probs[hets - 2] = probs[hets] * hets * (hets - 1) / (4 * (homR + 1) * (homC + 1))
        total += probs[hets - 2]
        homR += 1; homC += 1; hets -= 2
    hets, homR = mid, (rare - mid) // 2
    homC = n - hets - homR
    while hets <= rare - 2:
        probs[hets + 2] = probs[hets] * 4 * homR * homC / ((hets + 2) * (hets + 1))
        total += probs[hets + 2]
        homR -= 1; homC -= 1; hets += 2
    target = probs[ab]
    return min(1.0, sum(p for p in probs if p <= target * 1.0000001) / total)

# The three genotype frequencies against the minor allele frequency. The reason the
# chi-square test of Hardy-Weinberg breaks for rare variants is visible here directly: the
# minor-homozygote curve is quadratic, so it is still essentially on the floor at the
# frequencies where most variants live.
ax = Axes(84.0, 436.0, 46.0, 244.0, (0.0, 0.5), (0.0, 1.0))
o = [ax.frame()]
o.append(ax.ygrid([0.0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1.00']))
o.append(ax.xticks([0.0, 0.1, 0.2, 0.3, 0.4, 0.5], ['0', '0.1', '0.2', '0.3', '0.4', '0.5']))

o.append(ax.curve(lambda q: (1 - q) ** 2, n=200, width=2, dash='7 4'))
o.append(ax.curve(lambda q: 2 * q * (1 - q), n=200, width=2, stroke=ACCENT))
o.append(ax.curve(lambda q: q * q, n=200, width=2, dash='2 4'))

# A margin legend rather than inline labels: three curves crossing this densely leave no
# channel wide enough to set a label in without it sitting on one of them.
LX = ax.x1 + 14
LEGEND = [(76, '7 4', None, 'p²  major homozygote'),
          (100, None, ACCENT, '2pq  heterozygote'),
          (124, '2 4', None, 'q²  minor homozygote')]
for y, dash, col, lab in LEGEND:
    o.append(line(LX, y - 4, LX + 26, y - 4, 2, stroke=col or 'currentColor', dash=dash))
    o.append(text(LX + 33, y, lab, 10.5, fill=col, weight='600' if col else None))

# the heterozygote maximum, which is the whole reason q = 0.5 is special
o.append(circle(ax.px(0.5), ax.py(0.5), 4, fill=ACCENT))
o.append(text(ax.px(0.49), ax.py(0.625), 'heterozygosity peaks', 10.5, anchor='end',
              fill=ACCENT, weight='600'))
o.append(text(ax.px(0.49), ax.py(0.565), 'at 0.5, never higher', 10.5, anchor='end',
              fill=ACCENT, weight='600'))

# where the worked example sits, and what it costs the chi-square test
Q = 0.032
o.append(line(ax.px(Q), ax.py(0.0), ax.px(Q), ax.py(1.0), 1, opacity='.35', dash='3 3'))
o.append(circle(ax.px(Q), ax.py(Q * Q), 4, fill=ACCENT))
o.append(text(LX, 168, 'the worked example', 11, weight='700'))
for i, t in enumerate(['q = 0.032, so q² = 0.001024.',
                       'Hardy–Weinberg expects just',
                       '1.02 minor homozygotes in a',
                       'cohort of 1,000 — far below',
                       'the count χ² needs before it',
                       'can be trusted.']):
    o.append(text(LX, 184 + 13 * i, t, 10, opacity='.8'))

o.append(text((ax.x0 + ax.x1) / 2, 286, 'Minor allele frequency q', 12, anchor='middle'))
o.append(text(20, 145, 'Expected genotype frequency', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 145)"'))
o.append(text(20, 22, 'Hardy–Weinberg: one allele frequency fixes all three genotype frequencies',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-population-infinitesimal-hwe.svg'),
                           svg(640, 300, ''.join(o))))
print('   q=0.032: p2 %.6f  2pq %.6f  q2 %.6f  -> %.4f minor homozygotes per 1,000'
      % ((1 - Q) ** 2, 2 * Q * (1 - Q), Q * Q, 1000 * Q * Q))
print('   max heterozygosity %.4f at q = 0.5' % (2 * 0.5 * 0.5))

# ── Figure 2: the coalescent spends most of its depth on the last join ────────
NE = 10000
KMAX = 20
times = [(k, 4 * NE / (k * (k - 1))) for k in range(KMAX, 1, -1)]
total = sum(t for _, t in times)

ax2 = Axes(84.0, 470.0, 46.0, 236.0, (0.5, KMAX + 0.5), (0.0, 21000.0))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([0, 5000, 10000, 15000, 20000], ['0', '5k', '10k', '15k', '20k']))
p2.append(ax2.xticks([2, 5, 10, 15, 20], ['2', '5', '10', '15', '20']))
bw = (ax2.px(2) - ax2.px(1)) * 0.62
for k, t in times:
    h = ax2.py(0.0) - ax2.py(t)
    p2.append(rect(ax2.px(k) - bw / 2, ax2.py(t), bw, h,
                   fill=ACCENT if k == 2 else 'currentColor',
                   opacity=None if k == 2 else '.45'))
p2.append(text(ax2.px(2.6), ax2.py(times[-1][1]) + 12,
               '%s generations' % format(round(times[-1][1]), ','),
               10.5, fill=ACCENT, weight='600'))
p2.append(text(ax2.px(7), ax2.py(15200), 'E[Tₖ] = 4Nₑ / k(k−1)', 11.5, weight='600'))
p2.append(text(ax2.px(7), ax2.py(13400),
               'the wait for the last two lineages to join is %.0f%% of the whole tree'
               % (100 * times[-1][1] / total), 10.5, opacity='.8'))
p2.append(text(ax2.px(7), ax2.py(11800),
               'total depth E[TMRCA] = %s generations, and 4Nₑ = %s'
               % (format(round(total), ','), format(4 * NE, ',')), 10.5, opacity='.8'))
p2.append(text((ax2.x0 + ax2.x1) / 2, 280, 'Number of lineages remaining, k', 12, anchor='middle'))
p2.append(text(20, 141, 'Expected wait in that state', 11.5, anchor='middle',
               extra='transform="rotate(-90 20 141)"'))
p2.append(text(20, 22, 'A genealogy of 20 samples, Nₑ = 10,000: almost all of the depth is the last join',
               11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-population-infinitesimal-coalescent.svg'),
                           svg(640, 292, ''.join(p2))))
print('   E[T_2] %.0f  total %.0f  share %.4f  4Ne %d' % (times[-1][1], total, times[-1][1] / total, 4 * NE))
