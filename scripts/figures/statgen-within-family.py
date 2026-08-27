import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, path, write, circle, rect, Axes, ACCENT, splice

OUT = os.path.join(os.path.dirname(__file__), 'out')
MDX = os.path.join(os.path.dirname(__file__), '..', '..',
                   'src', 'content', 'deepDives', 'statgen-within-family.mdx')

# ── Figure 1 ── the approach to equilibrium ──────────────────────────────────
# Simulated additive variance by generation, infinitesimal model, N = 200,000,
# h2_0 = 0.5, mu = 0.4. Asserted in src/lib/deepDiveExamples.test.ts.
SIM = [(1, 0.49878), (2, 0.54794), (3, 0.58401), (5, 0.61632),
       (10, 0.64018), (20, 0.64725), (40, 0.64907)]
EQ = math.sqrt((0.5 * 0.5) / 0.6)      # 0.6454972
NAIVE = 0.5 / (1 - 0.4 * 0.5)          # 0.625, the wrong answer

ax = Axes(104.0, 424.0, 40.0, 236.0, (1, 40), (0.45, 0.68), xlog=True)
o = [ax.frame()]
o.append(ax.ygrid([0.45, 0.50, 0.55, 0.60, 0.65],
                  ['0.45', '0.50', '0.55', '0.60', '0.65'], size=10))
o.append(ax.xticks([1, 2, 5, 10, 20, 40], ['1', '2', '5', '10', '20', '40']))

o.append(line(ax.x0, ax.py(EQ), ax.x1, ax.py(EQ), 2.0, opacity='.85', dash='6 4', stroke=ACCENT))
o.append(text(ax.x1 - 4, ax.py(EQ) - 8, 'equilibrium  0.645497', 10, anchor='end',
              fill=ACCENT, weight='600'))
o.append(line(ax.x0, ax.py(NAIVE), ax.x1, ax.py(NAIVE), 1.8, opacity='.6', dash='2 3'))
o.append(text(ax.x1 - 4, ax.py(NAIVE) + 14, 'naive 1/(1 - mu h_0²) = 0.625', 10,
              anchor='end', opacity='.7'))

o.append(path([(ax.px(g), ax.py(v)) for g, v in SIM], width=2.6, stroke=ACCENT))
for g, v in SIM:
    o.append(circle(ax.px(g), ax.py(v), 3.6, fill=ACCENT))

o.append(text((ax.x0 + ax.x1) / 2, ax.py(0.45) + 42, 'Generation of assortative mating',
              12, anchor='middle'))
o.append(text(ax.x0 - 78, 24, 'Additive variance', 10.5, opacity='.85'))

LX = ax.x1 + 30
o.append(text(LX, 44, 'Ten generations, not one.', 11, weight='700'))
for i, t in enumerate([
        'Assortment does not change allele',
        'frequencies, so segregation',
        'variance is untouched, and',
        'V_A = V_A(1+rho)/2 + V_A0/2',
        'closes on V_A0/(1-rho), with',
        'rho = mu h².', '',
        'The catch is that h² there is the',
        'EQUILIBRIUM heritability, not the',
        'starting one. Using h_0² gives 0.625;',
        'solving self-consistently gives',
        '0.645497, which at h_0² = 1/2 is',
        'exactly sqrt(5/3) times the start.', '',
        'The approach takes about ten',
        'generations, so a population whose',
        'mating patterns changed recently is',
        'not at equilibrium and neither',
        'formula describes it.']):
    o.append(text(LX, 66 + 13 * i, t, 10, opacity='.8'))

svg1 = svg(772, 372, ''.join(o))
write(os.path.join(OUT, 'statgen-am-equilibrium.svg'), svg1)
splice(MDX, 0, svg1)
print('wrote statgen-am-equilibrium.svg')

# ── Figure 2 ── what the twin design reports ─────────────────────────────────
H2, RHO = 0.5635083268962915, 0.22540333075851658
TRUE = [('additive', H2), ('shared environment', 0.0), ('unique environment', 1 - H2)]
EST_H2 = H2 * (1 - RHO)
EST_C2 = H2 * RHO
EST = [('additive', EST_H2), ('shared environment', EST_C2), ('unique environment', 1 - H2)]

BAR_X0, BAR_W = 150.0, 300.0
o = []
for row, (label, parts) in enumerate((('Truth', TRUE), ('Twin study reports', EST))):
    y = 70 + row * 92
    o.append(text(BAR_X0 - 12, y + 20, label, 11.5, anchor='end', weight='600'))
    x = BAR_X0
    for i, (name, v) in enumerate(parts):
        w = BAR_W * v
        o.append(rect(x, y, w, 32, opacity=('.9' if i == 0 else ('.5' if i == 1 else '.2')),
                      fill=ACCENT if i < 2 else 'currentColor'))
        if w > 34:
            o.append(text(x + w / 2, y + 21, f'{v:.3f}', 10.5, anchor='middle',
                          fill='var(--color-on-accent, #fff)' if i == 0 else 'currentColor',
                          weight='600'))
        x += w
    # the invented component gets its label outside the bar, where it is always readable
    if row == 1:
        cx = BAR_X0 + BAR_W * EST_H2 + BAR_W * EST_C2 / 2
        o.append(line(cx, y - 6, cx, y - 20, 1.2, opacity='.7'))
        o.append(text(cx, y - 26, f'{EST_C2:.3f} of shared environment', 10.5,
                      anchor='middle', fill=ACCENT, weight='600'))
        o.append(text(cx, y - 14 + 62, 'that does not exist', 10.5, anchor='middle',
                      fill=ACCENT, weight='600'))

o.append(text(BAR_X0, 250, 'additive', 10, opacity='.85'))
o.append(rect(BAR_X0 - 14, 241, 10, 10, opacity='.9', fill=ACCENT))
o.append(text(BAR_X0 + 76, 250, 'shared environment', 10, opacity='.85'))
o.append(rect(BAR_X0 + 62, 241, 10, 10, opacity='.5', fill=ACCENT))
o.append(text(BAR_X0 + 210, 250, 'unique environment', 10, opacity='.85'))
o.append(rect(BAR_X0 + 196, 241, 10, 10, opacity='.2', fill='currentColor'))

LX = 500.0
o.append(text(LX, 44, 'The bias runs both ways.', 11, weight='700'))
for i, t in enumerate([
        'Falconer assumes dizygotic twins',
        'share half their additive variance.',
        'Under assortment they share',
        '(1+rho)/2 = 0.612702, so the',
        'MZ - DZ gap shrinks.', '',
        'Both halves move. Heritability is',
        'understated by the factor (1-rho):',
        '0.436492 against a true 0.563508.',
        'The missing variance is booked as',
        'shared environment, h² rho = 0.127017,',
        'whether or not any exists.', '',
        'Note the direction. Assortment',
        'raises the TRUE heritability, and',
        'lowers what the twin design says',
        'about it.']):
    o.append(text(LX, 66 + 13 * i, t, 10, opacity='.8'))

svg2 = svg(772, 300, ''.join(o))
write(os.path.join(OUT, 'statgen-twin-bias.svg'), svg2)
splice(MDX, 1, svg2)
print('wrote statgen-twin-bias.svg')
