import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
from figlib import svg, text, line, rect, write, ACCENT, ON_ACCENT, BG

# One genomic position, three coordinate systems. The c. numbers drawn here are recomputed
# in src/lib/deepDiveExamples.test.ts from cdsPosition(), which is the same function the
# worked example uses — so the figure cannot drift from the algebra beside it.

EXONS = [(1000, 1300), (1500, 1700), (2000, 2200)]
VARIANT = 1650
G0, G1 = 940, 2260
X0, X1 = 142.0, 568.0

def px(g): return X0 + (g - G0) / (G1 - G0) * (X1 - X0)

def coding_exons(cds_hi, cds_lo, minus=True):
    out = []
    for s, e in EXONS:
        s2, e2 = max(s, cds_lo), min(e, cds_hi)
        if s2 <= e2: out.append((s2, e2))
    return sorted(out, key=lambda t: -t[0] if minus else t[0])

def cds_pos(g, cds_hi, cds_lo, minus=True):
    acc = 0
    for s, e in coding_exons(cds_hi, cds_lo, minus):
        if s <= g <= e:
            return acc + (e - g + 1 if minus else g - s + 1)
        acc += e - s + 1
    return None

o = []
o.append(text(350, 16, 'One genomic position, three transcript models, three answers',
              11.5, anchor='middle', opacity='.8'))

# ── the gene model ───────────────────────────────────────────────────────────
GY, GH = 48.0, 20.0
o.append(line(px(EXONS[0][0]), GY + GH / 2, px(EXONS[-1][1]), GY + GH / 2, 1, opacity='.45'))
for s, e in EXONS:
    o.append(rect(px(s), GY, px(e) - px(s), GH, opacity='.28'))
# direction of transcription: minus strand runs right to left
for xf in (0.30, 0.55, 0.80):
    x = X0 + xf * (X1 - X0)
    o.append('<path d="M%.1f %.1f l5 -4 v8 z" fill="currentColor" opacity=".55"/>' % (x, GY + GH / 2))
o.append(text(px(EXONS[0][0]) - 10, GY + 14, 'minus strand', 10.5, anchor='end', opacity='.7'))
# the variant
o.append(line(px(VARIANT), GY - 12, px(VARIANT), GY + GH + 4, 1.5, stroke=ACCENT))
o.append(text(px(VARIANT), GY - 14, 'chr1:1,650 A>G', 10.5, anchor='middle', fill=ACCENT, weight='600'))

# ── three readings ───────────────────────────────────────────────────────────
ROWS = [
    ('MANE Select, minus', 2150, 1101, True,  'correct'),
    ('same exons, plus', 2150, 1101, False, 'wrong'),
    ('short isoform, minus', 1700, 1101, True, 'different, not wrong'),
]
RY, RH, GAP = 100.0, 16.0, 40.0
for i, (label, hi, lo, minus, verdict) in enumerate(ROWS):
    y = RY + i * GAP
    o.append(text(X0 - 12, y + 12, label, 10.5, anchor='end', opacity='.85'))
    ce = coding_exons(hi, lo, minus)
    for s, e in ce:
        o.append(rect(px(s), y, px(e) - px(s), RH, opacity='.5' if verdict == 'correct' else '.22'))
    # c.1 marker at the first coding base in transcript order
    first = ce[0]
    fx = px(first[1] if minus else first[0])
    o.append(line(fx, y - 5, fx, y + RH + 5, 1.25, stroke=ACCENT))
    o.append(text(fx + (5 if not minus else -5), y - 8, 'c.1', 10,
                  anchor='start' if not minus else 'end', fill=ACCENT, weight='600'))
    c = cds_pos(VARIANT, hi, lo, minus)
    codon = math.ceil(c / 3)
    o.append(line(px(VARIANT), y - 4, px(VARIANT), y + RH + 4, 1.5, stroke=ACCENT))
    o.append(text(X1 + 12, y + 12, 'c.%d · codon %d' % (c, codon), 11,
                  anchor='start', fill=ACCENT if verdict == 'correct' else 'currentColor', weight='600'))
    print('  %-22s c.%-4d codon %d' % (label, c, codon))

o.append(text(350, RY + 3 * GAP + 6,
              'The position never moved. Only the transcript and the strand did.',
              11, anchor='middle', opacity='.75'))

H = int(RY + 3 * GAP + 22)
print('bytes:', write(os.path.join(os.path.dirname(__file__), 'out', 'data-reference-annotation.svg'),
                      svg(700, H, ''.join(o))))
