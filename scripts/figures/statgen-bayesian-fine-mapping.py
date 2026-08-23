import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

N, P, W, PI0 = 50000, 0.30, 0.04, 0.05
V = 1 / (2 * P * (1 - P) * N)

def abf01(z):
    """Wakefield's approximate Bayes factor, BF01 — evidence for the null."""
    return math.sqrt((V + W) / V) * math.exp((-(z * z) / 2) * (W / (V + W)))

def pips(zs, pi0):
    terms = [(1 / len(zs)) / abf01(z) for z in zs]
    denom = pi0 + sum(terms)
    return [t / denom for t in terms]

SIGNAL = [2.1, 4.6, 6.2, 6.5, 6.2, 4.6, 2.4, 1.8]
NULLZ = [0.8, 1.2, 0.4, 1.7, 0.9, 1.1, 0.3, 1.4]

# ── Figure 1: the PIP profile, and the credible set LD makes unavoidable ─────
PS = pips(SIGNAL, PI0)
order = sorted(range(len(PS)), key=lambda i: -PS[i])
cs, cov = [], 0.0
for i in order:
    cs.append(i); cov += PS[i]
    if cov >= 0.95:
        break

ax = Axes(96.0, 430.0, 46.0, 200.0, (-0.7, 7.7), (0.0, 0.88))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.2, 0.4, 0.6, 0.8], ['0', '0.2', '0.4', '0.6', '0.8']))
o.append(ax.xticks(list(range(8)), ['v%d' % (i + 1) for i in range(8)]))
bw = 26
for i, p in enumerate(PS):
    inset = i in cs
    o.append(rect(ax.px(i) - bw / 2, ax.py(p), bw, ax.py(0) - ax.py(p),
                  fill=ACCENT if inset else 'currentColor', opacity=None if inset else '.35'))
    if p > 0.01:
        o.append(text(ax.px(i), ax.py(p) - 6, '%.3f' % p, 9.5, anchor='middle',
                      weight='600' if inset else None))

# No braces: this string is spliced into MDX, where { opens a JSX expression and the whole
# page fails to render with "v3 is not defined".
o.append(text(30, 262, 'The 95%% credible set is %s — three variants, coverage %.5f.'
              % (' + '.join('v%d' % (i + 1) for i in sorted(cs)), cov), 10.5, opacity='.9'))
o.append(text(30, 278, 'Its purity is 0.7000: the lowest pairwise r inside it. The data cannot',
              10.5, opacity='.85'))
o.append(text(30, 294, 'separate these three, and no amount of extra sample size will — only',
              10.5, opacity='.85'))
o.append(text(30, 310, 'recombination, or a population where the LD differs, can.', 10.5, opacity='.85'))

o.append(text((ax.x0 + ax.x1) / 2, 236, 'Variant', 12, anchor='middle'))
o.append(text(20, 123, 'PIP', 11.5, anchor='middle', extra='transform="rotate(-90 20 123)"'))
o.append(text(20, 22, 'One causal variant, three that the data cannot tell apart from it',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-bayesian-fine-mapping-pips.svg'),
                           svg(640, 326, ''.join(o))))
print('  signal PIPs:', ' '.join('%.6f' % p for p in PS))
print('  credible set', sorted(cs), 'coverage %.6f' % cov, ' sum PIP %.6f' % sum(PS))

# ── Figure 2: what dropping the null prior does at a locus with no signal ────
WITH = pips(NULLZ, PI0)
WITHOUT = pips(NULLZ, 0.0)

ax2 = Axes(120.0, 424.0, 62.0, 176.0, (-0.7, 7.7), (0.0, 0.30))
p2 = [ax2.frame()]
p2.append(ax2.ygrid([0, 0.1, 0.2, 0.3], ['0', '0.1', '0.2', '0.3']))
p2.append(ax2.xticks(list(range(8)), ['v%d' % (i + 1) for i in range(8)]))
bw2 = 12
for i in range(8):
    p2.append(rect(ax2.px(i) - bw2 - 1, ax2.py(WITH[i]), bw2, ax2.py(0) - ax2.py(WITH[i]),
                   fill=ACCENT))
    p2.append(rect(ax2.px(i) + 1, ax2.py(WITHOUT[i]), bw2, ax2.py(0) - ax2.py(WITHOUT[i]),
                   fill='currentColor', opacity='.45'))

LX = ax2.x1 + 14
p2.append(rect(LX, 66, 14, 10, fill=ACCENT))
p2.append(text(LX + 21, 75, 'with π₀ = 0.05', 10.5, weight='600', fill=ACCENT))
p2.append(text(LX, 92, 'PIPs sum to %.4f' % sum(WITH), 10, opacity='.85'))
p2.append(text(LX, 105, 'no 95% set exists', 10, opacity='.85'))
p2.append(rect(LX, 128, 14, 10, fill='currentColor', opacity='.45'))
p2.append(text(LX + 21, 137, 'with π₀ dropped', 10.5, weight='600'))
p2.append(text(LX, 154, 'PIPs forced to %.4f' % sum(WITHOUT), 10, opacity='.85'))
p2.append(text(LX, 167, 'a "95% set" of all 8,', 10, opacity='.85'))
p2.append(text(LX, 180, 'purity 0.0100', 10, opacity='.85'))

p2.append(text(30, 240, 'Eight variants with no signal at all — the largest z is 1.7. With the null',
               10.5, opacity='.85'))
p2.append(text(30, 256, 'prior kept, the posterior correctly refuses to name a causal variant. With',
               10.5, opacity='.85'))
p2.append(text(30, 272, 'it dropped, the PIPs are renormalised to one and the method returns a',
               10.5, opacity='.85'))
p2.append(text(30, 288, 'confident-looking credible set built entirely out of noise.', 10.5, opacity='.85'))

p2.append(text((ax2.x0 + ax2.x1) / 2, 212, 'Variant', 12, anchor='middle'))
p2.append(text(22, 119, 'PIP', 11.5, anchor='middle', extra='transform="rotate(-90 22 119)"'))
p2.append(text(20, 22, 'Why the null prior π₀ is not optional', 11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-bayesian-fine-mapping-nullprior.svg'),
                           svg(640, 304, ''.join(p2))))
print('  null locus with pi0: sum %.6f  max %.6f' % (sum(WITH), max(WITH)))
print('  null locus without : sum %.6f  max %.6f' % (sum(WITHOUT), max(WITHOUT)))
