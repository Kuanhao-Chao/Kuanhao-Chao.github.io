"""
Shared helpers for the deep-dive lesson figures.

Every figure in the curriculum is *computed* rather than drawn, so the curve on the
page is the same function the prose derives. These helpers exist so that the parts
that are easy to get subtly wrong — theme safety, subscripts, log axes — are written
once.

Two rules the whole set obeys:

  * **Colour never carries meaning.** The site has six themes plus a print stylesheet.
    Series are distinguished by dash pattern and direct labels; magnitude is shown with
    opacity over `currentColor`. `var(--color-accent)` is used only for annotation.
  * **Subscripts are real tspans.** These figures sit beside KaTeX-rendered maths, where
    an ASCII `V_A` is conspicuously unstyled.
"""

import math
import re

ACCENT = 'var(--color-accent, #2e6e5e)'
ON_ACCENT = 'var(--color-on-accent, #fff)'
BG = 'var(--color-bg, #fff)'


def sub(text, size=8.5):
    """`V_A` -> V with a real SVG subscript. Multi-character subscripts are written
    with braces, `h^2_{SNP}`, the same as in LaTeX."""
    def repl(m):
        return '%s<tspan font-size="%s" dy="3">%s</tspan><tspan dy="-3"></tspan>' % (
            m.group(1), size, m.group(2) or m.group(3))
    return re.sub(r'([A-Za-z0-9²])_(?:\{([^}]*)\}|([A-Za-z0-9]))', repl, text)


def text(x, y, s, size=11, anchor=None, fill='currentColor', opacity=None, weight=None, extra=''):
    a = ' text-anchor="%s"' % anchor if anchor else ''
    o = ' opacity="%s"' % opacity if opacity is not None else ''
    w = ' font-weight="%s"' % weight if weight else ''
    return '<text x="%.1f" y="%.1f" font-size="%s" fill="%s"%s%s%s%s>%s</text>' % (
        x, y, size, fill, a, o, w, (' ' + extra) if extra else '', sub(s))


def line(x1, y1, x2, y2, width=1, opacity=None, dash=None, stroke='currentColor'):
    o = ' opacity="%s"' % opacity if opacity is not None else ''
    d = ' stroke-dasharray="%s"' % dash if dash else ''
    return '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s%s/>' % (
        x1, y1, x2, y2, stroke, width, o, d)


def rect(x, y, w, h, opacity=None, fill='currentColor', rx=2, stroke=None, sw=1):
    # Accept either form. Every other primitive here takes opacity as a string like '.28',
    # and rect taking only a float was a trap for anyone writing their second figure — but
    # floats must keep formatting as %.2f, or already-published SVGs churn on regeneration
    # ('0.50' -> '0.5') for no visual change at all.
    o = '' if opacity is None else ' opacity="%s"' % (
        ('%.2f' % opacity) if isinstance(opacity, (int, float)) else opacity)
    s = ' stroke="%s" stroke-width="%s"' % (stroke, sw) if stroke else ''
    return '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%s" fill="%s"%s%s/>' % (
        x, y, w, h, rx, fill, o, s)


def path(points, width=2, dash=None, stroke='currentColor', opacity=None):
    d = ' stroke-dasharray="%s"' % dash if dash else ''
    o = ' opacity="%s"' % opacity if opacity is not None else ''
    pts = ' L'.join('%.1f,%.1f' % p for p in points)
    return '<path d="M%s" fill="none" stroke="%s" stroke-width="%s"%s%s/>' % (pts, stroke, width, d, o)


def circle(cx, cy, r, fill='currentColor', opacity=None, stroke=None, sw=1.5):
    o = ' opacity="%s"' % opacity if opacity is not None else ''
    s = ' stroke="%s" stroke-width="%s"' % (stroke, sw) if stroke else ''
    f = 'none' if fill is None else fill
    return '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"%s%s/>' % (cx, cy, r, f, o, s)


class Axes:
    """A plot frame with linear or log-10 mapping on either axis."""

    def __init__(self, x0, x1, y0, y1, xlim, ylim, xlog=False, ylog=False):
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1
        self.xlim, self.ylim, self.xlog, self.ylog = xlim, ylim, xlog, ylog

    def px(self, v):
        a, b = self.xlim
        if self.xlog:
            v, a, b = math.log10(v), math.log10(a), math.log10(b)
        return self.x0 + (v - a) / (b - a) * (self.x1 - self.x0)

    def py(self, v):
        a, b = self.ylim
        if self.ylog:
            v, a, b = math.log10(v), math.log10(a), math.log10(b)
        return self.y1 - (v - a) / (b - a) * (self.y1 - self.y0)

    def frame(self):
        return (line(self.x0, self.y0, self.x0, self.y1, 1.25) +
                line(self.x0, self.y1, self.x1, self.y1, 1.25))

    def curve(self, f, n=120, **kw):
        a, b = self.xlim
        pts = []
        for i in range(n + 1):
            t = i / n
            v = 10 ** (math.log10(a) + (math.log10(b) - math.log10(a)) * t) if self.xlog else a + (b - a) * t
            pts.append((self.px(v), self.py(f(v))))
        return path(pts, **kw)

    def xticks(self, values, labels=None, size=11):
        out = ''
        for i, v in enumerate(values):
            x = self.px(v)
            lab = labels[i] if labels else ('%g' % v)
            out += line(x, self.y1, x, self.y1 + 5)
            out += text(x, self.y1 + 18, lab, size, anchor='middle', opacity='.75')
        return out

    def ygrid(self, values, labels=None, size=11, emphasise=()):
        out = ''
        for i, v in enumerate(values):
            y = self.py(v)
            em = v in emphasise
            out += line(self.x0, y, self.x1, y, 1, '.3' if em else '.12', '4 4' if em else None)
            lab = labels[i] if labels else ('%g' % v)
            out += text(self.x0 - 8, y + 4, lab, size, anchor='end', opacity='.75')
        return out


def svg(width, height, body, extra=''):
    return '<svg viewBox="0 0 %d %d" width="%d" height="%d" font-family="inherit"%s>%s</svg>' % (
        width, height, width, height, (' ' + extra) if extra else '', body)


def write(path_, s):
    open(path_, 'w').write(s)
    return len(s)
