import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, rect, write, circle, Axes, ACCENT

# A variant allele fraction only becomes a cancer cell fraction once purity and copy number
# are divided out. At a diploid locus CCF = 2 VAF / rho, so each purity is a straight ray
# and the same VAF lands anywhere from subclonal to arithmetically impossible.
PURITIES = [0.35, 0.50, 0.68, 0.85]
ccf = lambda vaf, rho: 2 * vaf / rho
VAF_MAX, CCF_MAX = 0.6, 1.9

ax = Axes(78.0, 566.0, 36.0, 268.0, (0, VAF_MAX), (0, CCF_MAX))
o = [ax.frame()]
o.append(ax.ygrid([0, 0.5, 1.0, 1.5], ['0', '0.5', '1.0', '1.5']))
o.append(ax.xticks([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
                   ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6']))

# everything above CCF = 1 is impossible; shade it
o.append(rect(ax.x0, ax.y0, ax.x1 - ax.x0, ax.py(1.0) - ax.y0, opacity='.05'))
o.append(line(ax.x0, ax.py(1.0), ax.x1, ax.py(1.0), 1.5, stroke=ACCENT, dash='6 4'))
o.append(text(ax.x1 - 6, ax.py(1.0) - 8, 'CCF = 1 — every tumour cell', 10.5,
              anchor='end', fill=ACCENT, weight='600'))
o.append(text(ax.x0 + 10, ax.y0 + 16,
              'above this line an input is wrong, not the biology', 10.5, opacity='.7'))

for rho in PURITIES:
    xEnd = min(VAF_MAX, CCF_MAX * rho / 2)
    o.append(line(ax.px(0), ax.py(0), ax.px(xEnd), ax.py(ccf(xEnd, rho)), 1.75, opacity='.75'))
    o.append(text(ax.px(xEnd) + 6, ax.py(ccf(xEnd, rho)) + 4, 'purity %.2f' % rho, 10, opacity='.85'))

# the worked example: one VAF read against two purities
for vaf, rho, note in [(0.31, 0.68, 'clonal'), (0.11, 0.68, 'subclonal'), (0.31, 0.35, 'impossible')]:
    v = ccf(vaf, rho)
    o.append(circle(ax.px(vaf), ax.py(min(v, CCF_MAX)), 4.5, fill=ACCENT))
    print('  VAF %.2f  purity %.2f  ->  CCF %.4f   (%s)' % (vaf, rho, v, note))
o.append(line(ax.px(0.31), ax.py(0), ax.px(0.31), ax.py(CCF_MAX), 1, opacity='.25', dash='3 3'))
o.append(text(ax.px(0.31), ax.py(0) - 8, 'VAF 0.31', 10, anchor='middle', opacity='.7'))

o.append(text((ax.x0 + ax.x1) / 2, 300, 'Variant allele fraction', 12, anchor='middle'))
o.append(text(18, 152, 'Cancer cell fraction', 12, anchor='middle',
              extra='transform="rotate(-90 18 152)"'))
o.append(text((ax.x0 + ax.x1) / 2, 20,
              'One VAF, four purities: the same reads mean four different things', 11.5,
              anchor='middle', opacity='.8'))

print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-somatic-oncology.svg'),
                      svg(640, 314, ''.join(o))))
