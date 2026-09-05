"""Swallowed spaces, found in SOURCE rather than after a fifteen-minute rendering gate.

Usage:  python3 scripts/check-jsx-spacing.py src/pages/shorkie-lab/*.astro
        python3 scripts/check-jsx-spacing.py $(find src -name '*.astro')

Exits non-zero on any hit. `audit:playground` runs it over the three lab routes.

A newline between prose and an inline tag is DELETED by JSX, not collapsed to a space, so
`for\n<em>every` renders as "forevery". It is invisible in the source -- every line looks correctly
spaced -- and survives `astro check`, the test suite and every static audit. Three were introduced
in one session before this existed.

A newline before a JSX EXPRESSION swallows identically: `The Hessian\n{cond ? <>calls it…` renders
as "Hessiandoes". The first version of this file checked only tags and missed exactly that, which
the rendering gate then caught fifteen minutes later -- so the expression case is checked too, and
so is the closing `}` followed by a word.
"""
import pathlib, re, sys
INLINE = r'(?:em|strong|code|a|span|b|i)'
bad = 0
for f in sys.argv[1:] or ['src/pages/shorkie-lab/shorkie.astro']:
    src = pathlib.Path(f).read_text()
    # Skip the component frontmatter: a `---` fenced block is JavaScript, where an object literal
    # on its own line is ordinary code and swallows nothing.
    lines = src.split('\n')
    fences = [i for i, l in enumerate(lines) if l.strip() == '---']
    start = fences[1] + 1 if len(fences) >= 2 else 0
    for i in range(start, len(lines) - 1):
        cur, nxt = lines[i].rstrip(), lines[i + 1].lstrip()
        if not cur or not nxt:
            continue
        why = None
        # prose, then an inline tag on the next line
        if re.search(r'[\w),.;:%]$', cur) and re.match(rf'<{INLINE}\b[^>]*>[\w(]', nxt):
            why = 'tag'
        # a closing inline tag, then prose on the next line
        elif re.search(rf'</{INLINE}>$', cur) and re.match(r'[\w(]', nxt):
            why = 'close'
        # prose, then a JSX expression that opens with a fragment, a tag, or a quoted string --
        # `{cond ? <>…`, `{x.map(…)`, `{\'…\'}`. A leading `{\' \'}` is the FIX, not a fault.
        elif (re.search(r'[\w),.;:%]$', cur) and nxt.startswith('{')
              and not re.match(r"\{'\s", nxt) and not re.match(r'\{"\s', nxt)):
            # Two shapes supply their own spacing and are not faults:
            #   * an expression whose first emitted content is `{' '}` -- often on the NEXT line,
            #     inside a fragment, e.g. `{cond ? (\n  <>{' '}The …`
            #   * a suffix ternary whose branches are both short quoted strings, e.g. a pluraliser
            #     `{n === 1 ? '' : 's'}`, where no space is wanted at all
            look = ' '.join(lines[i + 1:i + 4])
            supplies_space = "<>{' '}" in look or re.match(r"\{[^{}]*\?\s*\{?'\s", look)
            pluraliser = re.match(r"\{[^{}]*\?\s*'[^']{0,3}'\s*:\s*'[^']{0,3}'\s*\}", nxt)
            # An expression whose first emitted character is punctuation wants no space
            # before it: `unmasked` then `{cond ? ", and chrM ..."}` renders
            # "unmasked, and chrM", which is correct.
            lit = re.search(r'[`\'"]([^`\'"])', nxt)
            punct_first = bool(lit and lit.group(1) in ',.;:)!?%-')
            if not supplies_space and not pluraliser and not punct_first:
                why = 'expr'
        if why:
            print(f'{f}:{i + 1}: [{why}] …{cur[-44:]}  ⇥  {nxt[:44]}…')
            bad += 1
print(f'{bad} swallowed space(s)')
raise SystemExit(1 if bad else 0)
