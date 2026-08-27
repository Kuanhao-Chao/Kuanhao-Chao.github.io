import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-molecular-qtl-twas.mdx')

THRESH = 4.7081                      # 0.05 / 20,000, two-sided
ZS = [(6, '6', '2 3'), (8, '8', None), (10, '10', '6 3'), (15, '15', '1 3')]

# ── Figure 1 ── a null gene's expected statistic, and where it crosses ───────
ax = Axes(104.0, 424.0, 40.0, 236.0, (0.0, 1.0), (0.0, 15.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 5, 10, 15], ['0', '5', '10', '15'], size=10))
o.append(ax.xticks([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1']))

# solid and horizontal, so it never reads as one of the rising dashed z-lines
o.append(line(ax.x0, ax.py(THRESH), ax.x1, ax.py(THRESH), 2.2, opacity='.5'))
o.append(text(ax.x0 + 5, ax.py(THRESH) - 7, '4.7081', 10, opacity='.75', weight='600'))

for z, lab, dash in ZS:
    solid = dash is None
    o.append(path([(ax.px(0), ax.py(0)), (ax.px(1), ax.py(min(z, 15)))], width=2.4 if solid else 1.9,
                  stroke=ACCENT if solid else 'currentColor', dash=dash,
                  opacity=None if solid else '.7'))
    r = THRESH / z
    o.append(circle(ax.px(r), ax.py(THRESH), 3.8, fill=ACCENT if solid else 'currentColor',
                    opacity=None if solid else '.7'))
    o.append(text(ax.px(1.0) - 4, ax.py(min(z, 15)) - 6, f'z = {lab}', 10, anchor='end',
                  fill=ACCENT if solid else 'currentColor',
                  opacity=None if solid else '.7', weight='600' if solid else None))

o.append(text(ax.px(0.5885) + 8, ax.py(1.4), '0.5885', 10.5, fill=ACCENT, weight='600'))
o.append(line(ax.px(0.5885), ax.py(THRESH), ax.px(0.5885), ax.py(2.2), 1.2, opacity='.5', dash='2 2'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 42,
              'Correlation r between the two genes’ predicted expression', 12, anchor='middle'))
o.append(text(ax.x0 - 78, 24, 'Expected TWAS statistic at the innocent gene', 10.5, opacity='.85'))

LX = ax.x1 + 30
o.append(text(LX, 44, 'A stronger locus implicates', 11, weight='700'))
o.append(text(LX, 58, 'MORE innocent genes.', 11, weight='700'))
for i, t in enumerate([
        'A null gene inherits E[z] = r z from',
        'a causal neighbour, exactly. So it',
        'clears the threshold whenever',
        'r > 4.7081/z - and that critical',
        'value FALLS as z rises:', '',
        '   z =  6   ->   r* = 0.7847',
        '   z =  8   ->   r* = 0.5885',
        '   z = 10   ->   r* = 0.4708',
        '   z = 15   ->   r* = 0.3139', '',
        'The dots are those crossings. A',
        'locus twice as significant drags',
        'in every gene down to half the',
        'correlation.', '',
        'For scale: in a realistic LD block',
        'a gene whose eQTLs sit four SNPs',
        'away already has r = 0.767.']):
    o.append(text(LX, 80 + 13 * i, t, 10, opacity='.8'))

svg1 = svg(772, 344, ''.join(o))
write(os.path.join(OUT, 'statgen-twas-inheritance.svg'), svg1)
splice(MDX, 0, svg1)
print('wrote statgen-twas-inheritance.svg')

# ── Figure 2 ── the same statement as a probability ─────────────────────────
def phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def ppass(r, z):
    m = r * z
    return (1 - phi(THRESH - m)) + phi(-THRESH - m)

ax2 = Axes(104.0, 424.0, 40.0, 236.0, (0.0, 1.0), (0.0, 1.0))
o = [ax2.frame()]
o.append(ax2.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1'], size=10,
                   emphasise=(0.5,)))
o.append(ax2.xticks([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1']))

for z, lab, dash in [(6, '6', '2 3'), (8, '8', None), (10, '10', '6 3')]:
    solid = dash is None
    o.append(path([(ax2.px(i / 200), ax2.py(ppass(i / 200, z))) for i in range(201)],
                  width=2.4 if solid else 1.9, stroke=ACCENT if solid else 'currentColor',
                  dash=dash, opacity=None if solid else '.7'))
    # no in-plot label: the three curves saturate together at the right edge and every
    # placement collided. The margin legend carries them.

o.append(circle(ax2.px(0.8), ax2.py(ppass(0.8, 8)), 4.2, fill=ACCENT))

o.append(text((ax2.x0 + ax2.x1) / 2, ax2.py(0.0) + 42,
              'Correlation r between the two genes’ predicted expression', 12, anchor='middle'))
o.append(text(ax2.x0 - 78, 24, 'Chance the innocent gene reaches significance', 10.5, opacity='.85'))

LX = ax2.x1 + 30
for i, (z, lab, dash) in enumerate([(10, '10', '6 3'), (8, '8', None), (6, '6', '2 3')]):
    yy = 40 + 17 * i
    solid = dash is None
    o.append(line(LX, yy - 4, LX + 22, yy - 4, 2.4 if solid else 1.9,
                  stroke=ACCENT if solid else 'currentColor', dash=dash,
                  opacity=None if solid else '.7'))
    o.append(text(LX + 30, yy, f'causal z = {lab}', 10,
                  fill=ACCENT if solid else 'currentColor',
                  opacity=None if solid else '.7', weight='600' if solid else None))

o.append(text(LX, 116, 'Not a tail risk.', 11, weight='700'))
for i, t in enumerate([
        'The dot is r = 0.80, where the',
        'chance is 0.9547.', '',
        'At a causal z of 8, a gene with no',
        'causal role whatsoever reaches',
        'transcriptome-wide significance', '',
        '   r = 0.5   ->   23.9% of the time',
        '   r = 0.6   ->   53.7%',
        '   r = 0.7   ->   81.4%',
        '   r = 0.8   ->   95.5%',
        '   r = 0.9   ->   99.4%', '',
        'Each curve passes through one half',
        'exactly at its own critical r, where',
        'the expected statistic equals the',
        'threshold.', '',
        'This is a power calculation for an',
        'effect nobody wants to detect, and',
        'it is why a TWAS hit names a locus',
        'rather than a gene.']):
    o.append(text(LX, 138 + 13 * i, t, 10, opacity='.8'))

svg2 = svg(772, 420, ''.join(o))
write(os.path.join(OUT, 'statgen-twas-probability.svg'), svg2)
splice(MDX, 1, svg2)
print('wrote statgen-twas-probability.svg')
