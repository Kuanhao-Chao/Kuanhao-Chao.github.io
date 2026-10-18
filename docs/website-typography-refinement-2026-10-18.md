# Website typography refinement — October 18, 2026

## Scope

Refine the existing Astro site for desktop, iPad-sized, and phone screens without changing its identity, fonts, palette, scientific claims, publication destinations, game order, or deployment architecture. This is an implementation of the approved typesetting audit, not a new visual identity or a content rewrite.

The Sites skill informed the hierarchy, spacing, and local visual review. The diagnosing-bugs skill informed the reproduce → isolate → fix → verify loop. The existing Astro/GitHub Pages setup was retained; no Sites hosting was provisioned.

## Implemented changes

1. **Shared type hierarchy.** Added explicit caption, editable-control, and listing-title tokens; relaxed shared heading/lead line heights and uppercase metadata tracking. Kept the existing display/body families and the homepage's distinctive large name.
2. **Text enlargement.** The header can wrap, and container queries collapse the desktop navigation when enlarged root text no longer fits. A `ResizeObserver` measures the header row, rather than assuming its height is always 69px.
3. **Reliable anchors.** Reading-page fragment targets use the measured header height, so section titles remain below the sticky header. Full-screen/bare interfaces keep their own layout ownership.
4. **Complete mobile navigation.** Lab titles, subtitles, and badges wrap instead of truncating; narrow drawers become one column. No navigation destinations were removed.
5. **Simpler footer appearance controls.** One 44px Appearance button opens the header's existing settings panel. Theme/CRT/background state has one owner; Escape and Close return focus to the originating trigger.
6. **Homepage hierarchy.** Research, CV, and full-terminal actions now precede the full biography. Social/contact links close the profile after the inline shell, separating primary navigation from contact options. The complete biography, name explanation, and collapsed inline terminal remain available.
7. **Tighter animation spacing.** Reduced the six art-window heights by approximately 20%, without changing the stage sequence, animation behavior, or reading veil settings.
8. **Research rows.** Mobile summaries are full-length, resource links remain visible, and thumbnails leave a usable text column. Homepage cards stack when enlarged text makes the horizontal presentation too narrow.
9. **Software rows.** On phones, descriptions and resource links use the full row width rather than competing with long wordmarks. Tools, games, icons, destinations, and order are preserved.
10. **Theme-safe artwork.** Scientific figures and dark wordmarks receive appropriate light backing in all four dark color themes, not only the default dark theme.
11. **Readable news previews.** Homepage cards display a headline, a word-safe plain-text preview, and an explicit Read update link. They no longer hide live links with CSS line clamping. Full news entries retain their rich content and resource links; the humble SpliceAI2 wording is preserved.
12. **Publication hierarchy.** Long author lists collapse only on phones, with the original complete author string retained and expandable. Citation tools and BibTeX source live under one Cite disclosure. Added actual BibTeX/RIS downloads while retaining copy controls. Open citation panels constrain long code locally instead of widening the page.
13. **Learning-page entry.** Added Start reading and Contents shortcuts; the ML interview hub also links directly to Search & practice. Objectives/prerequisites collapse on phones but remain visible on desktop, without JavaScript, and when printing.
14. **Readable diagrams.** Shared deep-dive SVG figures have a readable-size scroll frame, overview toggle, and keyboard-accessible expanded viewer with zoom, fit, and close controls. The original SVG node moves into the native dialog and back: no duplicated SVG IDs, gradients, or interactive state. Escape restores focus; Astro navigation cleans up listeners/observers; print restores inline art.
15. **Long-form reading details.** Consistent phone gutters, left-aligned captions, clearer table padding/rules, persistent prose-link underlines, locally scrollable long equations/code/tables, and visible overflow hints. Focusable tables retain native table/header semantics. Editable fields have a 16px minimum without disabling browser zoom.
16. **Narrow-screen edge cases.** News cards wrap at 200% text size. Tetris's board leaves room for its side panel, and Chinese Chess's mode selector wraps inside its toolbar at 320px; these are layout-only changes, not game-engine changes.

The 18 paper-summary tables of contents now use the ordered list's native numbering only. Section headings, IDs, references, and numerical claims were not rewritten.

The source-spacing audit also found and fixed 78 missing prose spaces across nine paper summaries, plus two on the 404 and Mamba pages. These insert only explicit JSX spaces; they do not alter numbers or scientific wording. A whole-source scan was reviewed separately: its remaining hits are script object literals and deliberately separated accordion icon/title elements, not prose joins.

The terminal regression audit exposed layout-dependent Chromium phone wheel trapping at the transcript boundary. Layout-only alternatives were not reliable across both phone sizes. The inline controller now explicitly hands **only outward boundary gestures** to the surrounding page, with pixel/line/page unit normalization. Native history scrolling, modifier/pinch gestures, and full-screen terminal behavior remain untouched. Six pure tests cover boundary direction, fractional/Safari positions, empty history, normalization, and invalid inputs; the existing browser checks retain their original scroll assertions.

## Regression coverage

`npm run audit:typography` is a new **local/manual-only** audit. Its default matrix exercises Chromium and WebKit at 320, 390, 820, 1024, and 1440px. `--quick` selects a single 390px Chromium profile; `--all-routes` additionally scans every built Astro document at 320, 820, and 1440px, excluding redirect stubs.

The checks cover document overflow, 200% root text, increased text spacing, navigation labels, resource visibility, citation copying/downloads, sticky anchors, lesson disclosures, diagram zoom/focus/fit, real Astro navigation, and readable form controls. The audit compares document scroll width to **client width**, because mobile `innerWidth` can grow with overflow and conceal a layout failure.

Existing appearance and terminal audits were updated to match the approved footer controls and homepage action placement. Unit coverage was added for news-preview formatting, SVG sizing/zoom/fit, and reading-page content contracts.

No heavy checks were added to push CI. The existing production build/PDF generation and indexing, link, and static-security gates remain the push workflow.

## Verification record

- `npm test`: **4,535 passed**, 350 existing skipped tests, 98 passing files.
- `npm run check`: **0 errors, 0 warnings**, 103 existing hints across 541 files.
- `npm run build`: **196 pages built**; public post/report PDFs regenerated; private-report PDFs correctly skipped. The existing large-chunk advisory remains, with no build errors.
- `npm run audit:indexing`: passed for 8 live posts and 8 reports.
- `npm run audit:links`: passed with 0 warnings.
- `npm run audit:security`: passed.
- Built-route layout coverage: **196 rendered routes × 320/820/1440px**, with no document overflow.
- `npm run audit:typography -- --all-routes`: **808/808 checks passed** on the final build, including both browser engines at 320/390/820/1024/1440px and the complete route scan.
- Terminal smoke regression: **2 routes × 2 engines × 3 profiles** passed, including native history movement and page handoff. Profiles were desktop, 390px phone, and 320px compact phone. The WebKit harness reports generic-control Tab focus-ring measurement as unavailable; Chromium measures that path.
- Appearance regression: desktop Chromium and mobile WebKit quick profiles passed; the software listing's full Chromium/WebKit audit also passed during refinement, including game order, icons, destinations, touch targets, and theme-safe artwork.
- `git diff --check` and JavaScript audit syntax checks passed. Temporary diagnostic code was removed.

The final typography matrix is recorded in the local artifact folder below. It tests both engines at all five widths, including 200% root text, increased text spacing, citation export, anchors, diagram controls, and real Astro navigation. The browser checks wait for the native dialog's close event and WebKit's rendering frame rather than measuring before restoration/reflow completes.

Local screenshot/result artifacts are intentionally not committed:

- Typography: `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-typography-ui-FydWBn/`
- Software: `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-software-ui-mg7Iuz/`
- Appearance: `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-appearance-ui-LKOIV1/` and `/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-appearance-ui-FKkALa/`

Representative final screenshots: [phone homepage](/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-typography-ui-FydWBn/chromium-390-home.png), [desktop homepage](/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-typography-ui-FydWBn/chromium-1440-home.png), [phone software rows](/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-typography-ui-FydWBn/chromium-390-software.png), and [expanded diagram](/var/folders/33/7v38jdjd2874jcxb6l71m00h0000gn/T/khc-typography-ui-FydWBn/chromium-390-diagram.png).

## Boundaries

- No framework, dependency, schema, canonical URL, Scholar pipeline, sitemap, robots policy, or publication-data migration.
- Existing private/unlisted reports stay private/unlisted.
- The initial handoff was verified locally before publication. Publishing uses the existing `main` → `deploy.yml` → GitHub Pages workflow; no hosting migration or heavier push checks are required.
- Browser emulation does not certify physical-device behavior. A short real iPhone/iPad Safari review remains useful, especially for large system text, on-screen keyboards, diagram panning, and print dialogs.
