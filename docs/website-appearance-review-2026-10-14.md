# Website appearance review — October 14, 2026

## Scope and starting point

Reviewed the shared layouts, homepage, navigation and footer, all six color themes,
appearance/background controllers, reading mask, logo review page, deployment workflow,
and representative content and dedicated-lab routes. Starting revision: `ad33c8cd`.
The worktree was clean and matched remote main before implementation.

The pre-change browser scan covered 21 routes at 1440px/light and 390px/dark:
home; Research; Publications; Software; Talks; Teaching; Posts; the Shorkie post;
News; CV; Projects; Photos; Deep Dives; statistical genetics; ML/DL interviews;
the AlphaGenome paper note; Search; pairwise alignment; 2048; Shorkie Lab; Terminal.
All 42 route/profile checks returned HTTP 200, had one content H1, and had no
document-level horizontal overflow. Dedicated algorithm/game/lab/terminal pages
correctly excluded the ambient canvas. This is a representative scan, not a claim
that every route or every external destination was browser-tested.

## Implemented in this release

### Reading comfort without changing the artwork

The apparent cell occlusion on ordinary pages was intentional full erasure in the
reading-mask policy, not a canvas stacking failure. Changing CSS opacity alone did
not fix it: the controller returned zero transmission off the homepage.

- Homepage prose and translucent research/software/news cards: 30% → **18%** art transmission.
- Ordinary-page prose and list rows: full erasure → **10%** transmission.
- Protected figures, SVGs, equations, inline/block code, media, tables, controls,
  terminals, complex widgets, header, and footer remain fully cleared.
- The ordinary-page background is still the **same single quiet cell**, not the
  optional living-Cells simulation. Geometry, size, location, particles, timing,
  physics, defaults, saved preference keys, and seven homepage story stages are unchanged.
- Nested prose boxes are unioned before a single alpha pass. Homepage card text
  is not attenuated a second time; protected descendants still are cleared.
- Off, Calm, Paused, reduced motion, selection pausing, and dedicated-lab exclusions remain.

These are fractions of already-translucent artwork, not 18%/10% global canvas
opacity. The fainter ordinary-page veil suits long-form reading.

The cross-theme contrast check also caught Cyberdeck's existing muted biography
text at about 4.08:1. Its muted slate-blue ink is slightly brighter in this release.
Parchment's muted research introduction reached 4.42:1 on a phone over the cell;
its supporting ink is slightly darker. WebKit phone rendering also exposed Monokai
supporting text at 4.39:1; its muted gray is slightly brighter. Other colors and the
Light, Dark, and Nord palettes are unchanged.

### A quieter Appearance panel

Light/Dark are immediately visible. More themes and Retro effects are collapsed,
with active advanced choices visible in their summaries. Background and Motion use
labeled native selects. Motion is disabled while Background is Off without losing
its previous choice. A short status and the opt-in explorer complete the panel.

The panel has a solid themed surface, fewer visual borders, simple icons, and a
close button. It stays open while adjusting settings. Escape returns focus to the
trigger; outside clicks dismiss it. Only one of Appearance, Labs, or the mobile
drawer is open. Desktop width is 288px; phone edges are inset 16px, and expanded
settings scroll inside the available viewport. The existing single theme/CRT
state owner and synchronized footer controls are retained.

WebKit rendered the native selects at about 20px when only `min-height` was set;
they now also have an explicit 44px height. Keyboard checks respect macOS WebKit's
native Option-Tab policy for including links while retaining ordinary Tab elsewhere.
Outside dismissal also listens to passive pointer-down events: WebKit phone taps
on a non-interactive page margin did not synthesize the click the old handler needed.

The storage-denial check found a pre-existing reset: the page swap copied the chosen
theme correctly, then page-load `theme.sync()` re-read inaccessible storage and
replaced it with the OS default. The single owner now retains explicit theme/CRT
choices in memory; storage events refresh choices from other tabs. Both blocked
storage and write-only quota failure have dedicated navigation regressions.

Labs now uses ordinary disclosure-navigation semantics and click/keyboard opening.
The old hover-then-click sequence opened and immediately closed the panel; the
new browser regression test reproduced that problem before the fix.

Header Labs order, on desktop and mobile:

1. Genome Browser
2. Algorithms
3. Deep Dives
4. Shorkie Lab
5. Cell Lab
6. Terminal

Fun Lab & Games is removed from the header only. Footer links, NN Lab, software
entries, games, and their destinations are preserved.

### Restrained homepage polish

Reduced default title/lead bottom margins to 1.25rem, and biography/terminal bottom
margins to 1.5rem. Existing mobile-specific overrides remain. Biography, portrait,
section ordering, selected publications, CTA destinations, and story-window heights
are untouched; this is spacing polish, not a content or layout rewrite.

### Three logo directions for a later decision

The unlisted, noindex `/logo-options/` review page features the current baseline
and three additional font-independent SVG concepts:

| Option | Direction | Best reason to choose it | Main tradeoff |
| --- | --- | --- | --- |
| 19 | Connected KH | Personal, bold shared-stem initials; strong small silhouette | Biology is implicit |
| 20 | Cellular C | Organic membrane/nucleus connects surname and living systems | Less specific to sequence modeling |
| 21 | Regulatory Bridge | Motif-like columns, regulatory arc, and prediction node | More conceptual and less personal |

Each has rationale, tradeoffs, light/dark/monochrome previews, a header mockup, and
16px/32px previews. Options 1–18 remain in a collapsed archive with their original
anchors. The production logo, favicons, manifest, and social preview images are unchanged.
The regulatory symbol is conceptual, not a measured motif or evidence of causality.

## Recommended next improvements — deliberately not implemented

### 1. Bring positioning and primary actions into the first phone screen

At 390×844 before this polish, the primary CTA started around y=999px, below the
first viewport. On 1440×1000 it began around y=805px. Small margin adjustments alone
do not solve the phone hierarchy. A future content/layout decision could shorten
the first-screen introduction, reduce repeated role wording between eyebrow and
biography, and move a compact Research/CV action row above the longer biography.
Keep the fuller biography available below rather than deleting useful context.

Success criterion: a new visitor can identify role, research focus, and a next
action without scrolling on a common phone viewport. Requires separate copy/order approval.

### 2. Give the large learning hubs a short entry path

The pre-change Deep Dives index was about 33,199px high on desktop and 75,180px on
phone. The ML/DL interview hub was about 72,485px / 116,176px; statistical genetics
about 18,966px / 27,513px. These measurements identify navigation load, not poor
educational quality. Preserve the detailed lessons, but make the hubs easier to enter:

- A concise “start here” path and expected prerequisites.
- Search/filter by topic, level, or interview focus.
- Collapsible module overviews and clear links into individual lessons.
- A separate quick-revision view rather than displaying every answer at once.

Success criterion: a first-time visitor reaches a relevant lesson in two meaningful
choices, while returning readers can locate a specific concept directly.

### 3. State individual contributions consistently

The research/software/publication sections contain strong evidence, but the visitor
must often infer the relationship between a project, the scientific question, and
the author's contribution. Add short, factual contribution lines to selected
projects in a future editorial pass; distinguish leadership, implementation,
collaboration, and team participation. Keep team-paper news appropriately modest.

Success criterion: each featured project answers “what problem, what contribution,
what evidence, where next?” without overstating authorship or causality.

### 4. Add optional compact routes through the long homepage

The pre-change page was about 8,054px high on desktop and 10,141px on phone.
The long-form story is intentional; a short jump-link row for Research,
Publications, Software, and Contact could help task-oriented visitors. Consider
whether every lower section needs the same initial visual weight. Keep the
seven-stage artwork sequence coherent if section structure changes later.

### 5. Decide on a logo only after an optical review

Compare options 19–21 against the baseline at actual 16px size, in monochrome,
and beside the full name. Connected KH is the strongest personal-identity direction;
Regulatory Bridge is the closest research cue; Cellular C is the warmest life-science
direction. None needs to replace the existing recognizable mark immediately.

## Verification and evidence

The implementation uses the agreed test seams: pure veil policy; real masked
canvas pixels; rendered Appearance preferences; rendered Labs navigation; and logo
review previews. New assertions failed against the old behavior before the relevant
changes. Browser artifacts stay outside the repository.

Reproducible local checks:

```sh
npm test
npm run check
npm run build
npm run audit:indexing
npm run audit:links
npm run audit:security
npm run audit:appearance
npm run audit:appearance -- --logos-only
BACKGROUND_UI_VEIL_ONLY=1 npm run audit:background:ci
```

`audit:appearance` is local/manual only. Push deployment retains its existing
lightweight build/PDF/indexing/link/security path; this release does not add slow
browser checks to every push or automatically dispatch a full audit.

Browser checks cover Chromium and WebKit at 320/390/1440px, all six themes,
keyboard/touch-target layout, CRT choices, saved settings, footer synchronization,
Astro navigation, reduced-motion behavior, and actual-art contrast. Pixel caps are
48/255 behind homepage prose and 28/255 behind ordinary prose; a guaranteed-overlap
probe also requires nonzero art, and protected-content checks require full clearance.

Measured local results:

- 4,445 unit tests passed in 92 files; 350 pre-existing skipped tests remain unchanged.
- Astro check: zero errors and zero warnings; existing non-blocking hints remain.
- JSX spacing check on all five edited Astro files: zero swallowed spaces.
- Full background regression suite passed in Chromium and WebKit, desktop and
  phone, including 14 pre-/post-hydration migration cases per engine and the
  seven-stage story, transcription, paused/reduced-motion behavior, route
  exclusions, and native-control switching.
- Actual homepage text alpha: 45/255 desktop, 39–40/255 phone, against a 48 cap.
  Ordinary nested-prose overlap: 15–17/255 desktop, 11–12/255 phone, against a 28 cap.
  SVGs, figures, KaTeX, code, textareas, and protected widgets cleared to ≤1/255.
- Logo review: 36 engine/width/theme combinations passed, including the archive
  anchors and unchanged live logo. Screenshots are temporary, outside the repo.
- Contrast checks use actual rendered art behind visible homepage and Research
  text, not just palette tokens. They caught the two palette corrections above;
  Monokai's phone result differed across engines (4.56:1 Chromium versus 4.39:1
  WebKit), motivating the final gray adjustment rather than accepting one engine's pass.

The first local full production build, PDF generation, immediate indexing audit,
link audit (zero warnings), and security audit passed. Final clean rebuild attempts
then exceeded this machine's available disk space (`ENOSPC`), including one with
browser audits stopped. Only failed generated output and this session's temporary
background screenshot folders were deleted. Final-source browser checks use the
dev server with its toolbar disabled through an inline audit-only configuration;
large public assets are served in place. The normal deployment workflow provides
the final production/PDF/indexing/link/security gate. Its result is verified before
handoff; no check is weakened to accommodate local storage constraints.

See the [deployment history](https://github.com/Kuanhao-Chao/Kuanhao-Chao.github.io/actions/workflows/deploy.yml)
for the publishing run. Detailed release status and its exact run link are included
in the implementation handoff.

## Accessibility references

- [WAI disclosure-navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/): ordinary site navigation uses disclosure buttons and links rather than application-menu roles.
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text 4.5:1; qualifying large text 3:1. The local contrast probe composites actual artwork pixels and foreground surfaces before measuring.
