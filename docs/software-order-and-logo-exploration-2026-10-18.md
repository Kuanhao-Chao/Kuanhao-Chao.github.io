# Software order and fresh logo exploration — 2026-10-18

## Game listing

The shared `sideProjects` catalog now presents:

1. Biobaby
2. Tank Fire
3. Genome Jumper
4. 100-Floor Descent
5. Flappy Penguin
6. Proofreader
7. Dino Run
8. Snake
9. Tetris
10. Chinese Chess
11. 2048
12. Minesweeper
13. CRISPR Commander
14. Phage Defense
15. Jetpack Joyride
16. BayRoute

The Software page and terminal payload both consume this catalog. Game descriptions,
URLs, artwork, and research-software ordering are unchanged. The tests now associate
destinations, external-link behavior, action labels, and header sizes with game
identity instead of assuming particular positions in the list.

## Three fresh logo concepts

Review at `/logo-options/`. The live header logo, favicons, manifest, and social
previews are unchanged. This is an unlisted, noindex review page, not an
access-controlled private page.

| Option | Concept | Rationale | Tradeoff |
| --- | --- | --- | --- |
| 22 | Junction KC | Shared initial geometry, curved junction, and exon-like terminals make a personal scientific signature | The biology is subtle; initials carry the identity |
| 23 | Chromatin Fold | An asymmetric ribbon with a separated crossing evokes structure emerging from sequence | It is conceptual artwork, not a biological structure model |
| 24 | Inference Prism | Three inputs, a hollow geometric core, and one output emphasize sequence-to-function modeling | Strong modeling cue, weaker personal association |

Each concept uses self-contained, font-independent SVG geometry. The review shows
light, dark, monochrome, header-context, and actual 16px/32px previews. The featured
comparison uses two columns on desktop/tablet and one column on phones so the
artwork has room to read. All earlier options 1–21 retain their original anchors
inside a collapsed archive. Archive counts derive from the data, and direct links
open the containing archive without a hard-coded option-number range.

**Decision pending:** choose a concept before changing production branding. No
favicon regeneration or automatic logo selection is part of this release.

## Verification

- Full unit suite: 4,536 passed, 350 skipped across 98 files.
- Focused catalog contract: exact order, unique names/URLs, preserved destinations,
  and BayRoute's teaching-lab description.
- A TypeScript-AST comparison against the previous commit confirms all 16 game
  records are identical apart from order, and the research-software catalog is
  unchanged.
- `npm run check`: 0 errors, 0 warnings, 103 existing hints across 541 files.
- Production build: 196 pages plus the eligible post/report PDFs.
- Indexing, built-link, and static-security audits passed; no link warnings.
- Edited Astro source: 0 swallowed JSX spaces; Git whitespace check passed.
- Software browser review: 24 passing profiles across Chromium/WebKit, widths
  1440/768/390/320, light/dark, and the four additional desktop themes. Coverage
  includes order, destinations, terminal order, game artwork, action labels,
  external-link attributes, touch targets, header reuse, and horizontal overflow.
- Logo browser review: 48 passing profiles across both browsers, the same four
  widths, and all six themes. Coverage includes the current-plus-three comparison,
  21 archived options, distinct self-contained SVGs, 16px/32px sizing, unchanged
  live header logo, and archive links for options 8/19/20/21 including direct entry.

Local screenshot evidence (temporary, not committed):

- Software: `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-software-ui-cAXkVE/`
- Logo comparisons: `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-appearance-ui-UB2cbe/`
- Desktop example: `chromium-1440-light-logo-comparison.png`
- Phone example: `webkit-390-dark-logo-comparison.png`

Push CI remains unchanged: production build/PDF generation and indexing, built-link,
and static-security audits only. Browser and unit checks remain local/manual.
