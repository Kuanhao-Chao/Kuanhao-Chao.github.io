import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-detecting-selection.mdx')

# ── Figure 1 ── age against frequency, in units of 4N so it holds for any N ───
# Points are the mean age of segregating alleles in a Wright-Fisher population with
# 2N = 1,000 and theta = 10, run 60,000 generations, binned at +-0.01 in frequency.
# Divided by 4N they overlay the closed form directly. Every value is asserted in
# src/lib/deepDiveExamples.test.ts.
SIM = [(0.05, 0.1525), (0.10, 0.2498), (0.20, 0.3839), (0.30, 0.5047),
       (0.50, 0.6715), (0.70, 0.8036), (0.90, 0.9045)]

def age_over_4n(p):
    return -(p / (1 - p)) * math.log(p)

ax = Axes(104.0, 424.0, 40.0, 236.0, (0.0, 1.0), (0.0, 1.0))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1'], size=10))
o.append(ax.xticks([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1']))

o.append(path([(ax.px(0.002 + i * 0.996 / 200), ax.py(min(age_over_4n(0.002 + i * 0.996 / 200), 1.0)))
               for i in range(201)], width=2.6, stroke=ACCENT))
for p, v in SIM:
    o.append(circle(ax.px(p), ax.py(v), 3.5, fill='currentColor', opacity='.8'))

# the swept allele: p = 0.5, 500 generations, N = 10,000 -> 500/40000
o.append(circle(ax.px(0.5), ax.py(0.0125), 5.2, fill=None, stroke=ACCENT, sw=2.2))
o.append(line(ax.px(0.5), ax.py(0.0125), ax.px(0.5), ax.py(0.6715), 1.4, opacity='.55', dash='3 3'))
o.append(text(ax.px(0.52), ax.py(0.115), 'a sweep lands here', 10.5, fill=ACCENT, weight='600'))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.0) + 42, 'Derived allele frequency p', 12, anchor='middle'))
o.append(text(ax.x0 - 76, 24, 'Expected age, in units of 4N generations', 10.5, opacity='.85'))

LX = ax.x1 + 30
o.append(circle(LX + 8, 36, 3.5, fill='currentColor', opacity='.8'))
o.append(text(LX + 22, 40, 'Wright-Fisher simulation', 10, opacity='.8'))
o.append(line(LX, 53, LX + 16, 53, 2.6, stroke=ACCENT))
o.append(text(LX + 22, 57, 'closed form', 10, fill=ACCENT, weight='600'))

o.append(text(LX, 85, 'Frequency pins age.', 11, weight='700'))
for i, t in enumerate([
        'A common allele is an old one:',
        'drift is slow, and getting to',
        'one half takes 4N ln2 = 27,726',
        'generations at N = 10,000,',
        'about 693,000 years.', '',
        'The simulation sits 3-4% under',
        'the curve at every frequency -',
        'a flat offset, which is the',
        'diffusion approximation being',
        'asymptotic in N rather than the',
        'shape being wrong.', '',
        'The ring is a variant swept to',
        'one half in 500 generations.',
        'It is 55.45 times too young for',
        'its frequency, and that single',
        'mismatch is what every method',
        'in this lesson is measuring.']):
    o.append(text(LX, 107 + 13 * i, t, 10, opacity='.8'))

svg1 = svg(772, 372, ''.join(o))
write(os.path.join(OUT, 'statgen-allele-age.svg'), svg1)
splice(MDX, 0, svg1)
print('wrote statgen-allele-age.svg')

# ── Figure 2 ── EHH decay: the same frequency, two genealogies ────────────────
# EHH(d) = exp(-2 d t) with d in Morgans; drawn against kb at 1 cM/Mb.
NEUTRAL_T = 4 * 10000 * math.log(2)      # 27,725.887 generations
SWEEP_T = 500

def ehh(kb, t):
    return math.exp(-2 * (kb * 1e-5) * t)

ax2 = Axes(104.0, 424.0, 40.0, 236.0, (0.1, 300.0), (0.0, 1.0), xlog=True)
o = [ax2.frame()]
o.append(ax2.ygrid([0, 0.25, 0.5, 0.75, 1.0], ['0', '0.25', '0.50', '0.75', '1'],
                   size=10, emphasise=(0.5,)))
o.append(ax2.xticks([0.1, 1, 10, 100], ['0.1', '1', '10', '100']))

for t, dash, stroke, op in ((SWEEP_T, None, ACCENT, None),
                            (NEUTRAL_T, '5 3', 'currentColor', '.85')):
    o.append(path([(ax2.px(10 ** (-1 + i * 3.4771 / 180)), ax2.py(ehh(10 ** (-1 + i * 3.4771 / 180), t)))
                   for i in range(181)], width=2.6, stroke=stroke, dash=dash, opacity=op))

for kb, t, lab in ((69.31, SWEEP_T, '69.31 kb'), (1.25, NEUTRAL_T, '1.25 kb')):
    o.append(circle(ax2.px(kb), ax2.py(0.5), 4.0, fill=ACCENT))
# both labels sat on their own curve; the empty quadrant is up-and-right of the swept
# crossing (the curve has already dropped below 0.5 there) and down-and-left of the
# neutral one (which is still above 0.5 to its left)
o.append(text(ax2.px(69.31) + 12, ax2.py(0.5) - 9, '69.31 kb', 10.5,
              fill=ACCENT, weight='600'))
o.append(text(ax2.px(1.25) - 11, ax2.py(0.5) + 17, '1.25 kb', 10.5, anchor='end',
              fill=ACCENT, weight='600'))

o.append(text((ax2.x0 + ax2.x1) / 2, ax2.py(0.0) + 42,
              'Distance from the core variant, kb at 1 cM/Mb', 12, anchor='middle'))
o.append(text(ax2.x0 - 76, 24, 'Extended haplotype homozygosity', 10.5, opacity='.85'))

LX = ax2.x1 + 30
o.append(line(LX, 36, LX + 16, 36, 2.6, stroke=ACCENT))
o.append(text(LX + 22, 40, 'swept, 500 generations', 10, fill=ACCENT, weight='600'))
o.append(line(LX, 53, LX + 16, 53, 2.6, stroke='currentColor', dash='5 3', opacity='.85'))
o.append(text(LX + 22, 57, 'neutral floor', 10, opacity='.85'))

o.append(text(LX, 85, 'Both alleles sit at p = 1/2.', 11, weight='700'))
for i, t in enumerate([
        'Homozygosity decays as',
        'exp(-2dt): two lineages that',
        'coalesced t generations ago',
        'have had 2t generations of',
        'recombination between them.', '',
        'The dashed curve takes t to be',
        'the allele’s own age, which is',
        'the most recombination',
        'neutrality can allow - so it is',
        'a floor on the neutral length,',
        'not an estimate of it. At',
        'p = 1/2 the ln2 cancels and it',
        'is exactly 1/(8N) Morgans.', '',
        'The real neutral curve lies',
        'between the two, and where',
        'exactly depends on demography.',
        'That is why iHS compares the',
        'derived and ancestral',
        'haplotypes at one locus rather',
        'than measuring either against',
        'an absolute expectation.']):
    o.append(text(LX, 107 + 13 * i, t, 10, opacity='.8'))

svg2 = svg(772, 420, ''.join(o))
write(os.path.join(OUT, 'statgen-ehh-decay.svg'), svg2)
splice(MDX, 1, svg2)
print('wrote statgen-ehh-decay.svg')
