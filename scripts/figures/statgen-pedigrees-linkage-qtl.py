import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT

OUT = os.path.join(os.path.dirname(__file__), 'out')

# ── Figure 1: the first-cousin pedigree the worked example walks ──────────────
# Squares are male, circles female, by the standard convention. Every kinship the
# lesson quotes is annotated on the individuals it relates, so the picture and the
# arithmetic cannot drift apart.
o = []
SQ, R = 15, 9.5

def male(x, y, lab, fill=None):
    out = rect(x - SQ, y - SQ, 2 * SQ, 2 * SQ, fill=fill or 'none',
               stroke='currentColor', sw=1.6)
    out += text(x, y + 4, lab, 10.5, anchor='middle', weight='600',
                fill='var(--color-on-accent,#fff)' if fill else 'currentColor')
    return out

def female(x, y, lab, fill=None):
    out = circle(x, y, SQ, fill=fill or 'none', stroke='currentColor', sw=1.6)
    out += text(x, y + 4, lab, 10.5, anchor='middle', weight='600',
                fill='var(--color-on-accent,#fff)' if fill else 'currentColor')
    return out

def couple(x1, x2, y):
    """Mating line, plus the drop to the sibship bar."""
    return line(x1 + SQ, y, x2 - SQ, y, 1.6)

def descend(xm, y, children, ybar, ychild):
    out = line(xm, y, xm, ybar, 1.6)
    out += line(min(children), ybar, max(children), ybar, 1.6)
    for cx in children:
        out += line(cx, ybar, cx, ychild - SQ, 1.6)
    return out

Y1, Y2, Y3, Y4 = 52, 138, 224, 224
# Generation I: the shared grandparents
o.append(male(150, Y1, 'G1'))
o.append(female(250, Y1, 'G2'))
o.append(couple(150, 250, Y1))
o.append(descend(200, Y1, [150, 250], Y1 + 40, Y2))

# Generation II: full sibs P1 and P2, each married in
o.append(male(150, Y2, 'P1'))
o.append(male(250, Y2, 'P2'))
o.append(female(60, Y2, 'S1'))
o.append(female(340, Y2, 'S2'))
o.append(couple(60, 150, Y2))
o.append(couple(250, 340, Y2))
o.append(descend(105, Y2, [105], Y2 + 40, Y3))
o.append(descend(295, Y2, [295], Y2 + 40, Y3))

# Generation III: the first cousins, who mate
o.append(male(105, Y3, 'C1'))
o.append(female(295, Y3, 'C2'))
o.append(couple(105, 295, Y3))
o.append(line(200, Y3, 200, Y3 + 44, 1.6))
o.append(circle(200, Y3 + 60, SQ, fill=ACCENT, stroke=ACCENT, sw=1.6))
o.append(text(200, Y3 + 64, 'X', 10.5, anchor='middle', weight='600',
              fill='var(--color-on-accent,#fff)'))

# The numbers the worked example computes, in a column beside the pedigree: set inside it
# they are crossed by the descent lines, and the right half of the frame is empty anyway.
LX = 396
o.append(text(LX, 50, '□ male    ○ female', 10.5, opacity='.7'))
o.append(text(LX, 84, 'P1 and P2 are full sibs', 11, weight='700'))
o.append(text(LX, 100, 'f(P1, P2) = 1/4', 10.5, opacity='.85'))
o.append(text(LX, 134, 'C1 and C2 are first cousins', 11, weight='700', fill=ACCENT))
o.append(text(LX, 150, 'f(C1, C2) = 1/16 = 0.0625', 10.5, opacity='.85'))
o.append(text(LX, 166, 'A(C1, C2) = 2f = 0.125', 10.5, opacity='.85'))
o.append(text(LX, 200, 'X is their child, so X is inbred', 11, weight='700', fill=ACCENT))
o.append(text(LX, 216, 'F(X) = f(C1, C2) = 0.0625', 10.5, opacity='.85'))
o.append(text(LX, 232, 'f(X, X) = ½(1 + F) = 0.53125', 10.5, opacity='.85'))
o.append(text(LX, 248, 'A(X, X) = 1 + F = 1.0625', 10.5, opacity='.85'))

o.append(text(30, 22, 'A first-cousin mating: every kinship the worked example computes, on the pedigree it comes from',
              11.5, opacity='.8'))
print('fig1 bytes:', write(os.path.join(OUT, 'statgen-pedigrees-linkage-qtl-pedigree.svg'),
                           svg(640, 320, ''.join(o))))

# ── Figure 2: the LOD curve, its maximum, and what the threshold means ────────
REC, TOTAL = 3, 25

def lod(theta):
    if theta <= 0:
        return float('-inf') if REC else TOTAL * math.log10(2)
    if theta >= 0.5:
        return 0.0
    return (REC * math.log10(theta) + (TOTAL - REC) * math.log10(1 - theta)
            + TOTAL * math.log10(2))

THETA_HAT = REC / TOTAL
LOD_MAX = lod(THETA_HAT)

ax = Axes(84.0, 458.0, 46.0, 246.0, (0.0, 0.5), (-1.0, 4.2))
p = [ax.frame()]
p.append(ax.ygrid([-1, 0, 1, 2, 3, 4], ['-1', '0', '1', '2', '3', '4']))
p.append(ax.xticks([0.0, 0.1, 0.2, 0.3, 0.4, 0.5], ['0', '0.1', '0.2', '0.3', '0.4', '0.5']))

pts = []
for i in range(1, 501):
    t = 0.5 * i / 500
    v = lod(t)
    if v >= -1.0:
        pts.append((ax.px(t), ax.py(v)))
p.append(path(pts, width=2))

# the classical threshold, and the one a genome scan actually needs
p.append(line(ax.x0, ax.py(3.0), ax.x1, ax.py(3.0), 1.4, stroke=ACCENT, dash='5 3'))
p.append(text(ax.x1 - 6, ax.py(3.0) - 7, 'LOD = 3, the classical threshold', 10.5,
              anchor='end', fill=ACCENT, weight='600'))
p.append(line(ax.x0, ax.py(0.0), ax.x1, ax.py(0.0), 1, opacity='.35'))

p.append(circle(ax.px(THETA_HAT), ax.py(LOD_MAX), 4.5, fill=ACCENT))
p.append(line(ax.px(THETA_HAT), ax.py(-1.0), ax.px(THETA_HAT), ax.py(LOD_MAX), 1,
              opacity='.3', dash='3 3'))
# Below the curve, with a leader up to the peak: everything to the right of the maximum
# is on the curve itself at this scale.
p.append(line(ax.px(THETA_HAT), ax.py(LOD_MAX) - 5, ax.px(0.155), ax.py(1.72), 1, opacity='.45'))
p.append(text(ax.px(0.16), ax.py(1.6),
              'peak at θ = %.2f,' % THETA_HAT, 10.5, weight='600'))
p.append(text(ax.px(0.16), ax.py(1.32),
              'LOD = %.4f' % LOD_MAX, 10.5, weight='600'))

LX = ax.x1 + 12
p.append(text(LX, 108, 'LOD 3 in other units', 11, weight='700'))
for i, t in enumerate(['χ² = 2 ln(10) × 3', '    = 13.8155 on 1 df', 'point-wise p = 2.0 × 10⁻⁴']):
    p.append(text(LX, 124 + 13 * i, t, 10, opacity='.8'))
p.append(text(LX, 180, 'Not p = 0.001: the', 10, opacity='.8'))
p.append(text(LX, 193, 'thousand-to-one reading', 10, opacity='.8'))
p.append(text(LX, 206, 'is about the prior odds', 10, opacity='.8'))
p.append(text(LX, 219, 'that two loci are linked.', 10, opacity='.8'))

p.append(text((ax.x0 + ax.x1) / 2, 288, 'Recombination fraction θ', 12, anchor='middle'))
p.append(text(20, 146, 'LOD score', 11.5, anchor='middle',
              extra='transform="rotate(-90 20 146)"'))
p.append(text(20, 22, 'Three recombinants in twenty-five meioses: the whole of the evidence for linkage',
              11.5, opacity='.8'))
print('fig2 bytes:', write(os.path.join(OUT, 'statgen-pedigrees-linkage-qtl-lod.svg'),
                           svg(640, 302, ''.join(p))))
print('  theta_hat %.4f  lod_max %.6f  lod(0.5) %.4f  chi2(3) %.4f'
      % (THETA_HAT, LOD_MAX, lod(0.5), 2 * math.log(10) * 3))
