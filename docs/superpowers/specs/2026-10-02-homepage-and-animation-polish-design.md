# Homepage and luminous background polish

Approved Claude design, transcribed for implementation on 2026-10-02. Source:
`~/.claude/plans/gleaming-knitting-peacock.md`. Status: implementation in progress.

## Scope and existing work

Continue `feature/home-animation-polish`, preserving Claude's six uncommitted terminal files.
Keep the seven-form story from `4742a9c3`: DNA → RNA → protein → cell → expression →
neural network → probability density. Preserve the already committed four-publication
homepage, removal of its Algorithms section, and eLife reviewed-preprint citation
(`10.7554/eLife.112217.1`, 2026-09-15), with bioRxiv retained as a secondary link.
Historical news and genome-track provenance stay unchanged. Algorithms routes and nav stay.
The network chapter belongs to Recent news. No new first-person announcement.

## Terminal

Place the terminal directly after About my name in the hero DOM, initially collapsed.
Restore by bar or yellow dot; close/reopen, keyboard use, and transcript scrolling remain usable.
The demo timer and document-level takeover listener belong only to a visible, expanded card.
Suspend without wiping when hidden; resume the same character when restored. Chrome interactions
never count as takeover. Fetch the terminal index only after real interaction.
Restore recalculates columns and prompt and scrolls the transcript without scrolling the page.
The full terminal route retains its boot behavior; reduced motion retains a static transcript.
Use native wheel chaining from transcript bounds to the page on Chromium, without a JS wheel trap.
At 320, 390, 768, and 1440 px there must be no horizontal overflow or misplaced terminal.

## Two scenes, plus accessibility

Supported scene ids are `cells | morph | off`; Off remains an accessibility choice.
Remove Flow Field and Learning Landscape renderers, explorer UI, and exclusive math.
Migrate an obsolete or unknown saved scene to Cells while retaining valid saved motion.
Pre-hydration and hydrated preference resolution must agree; storage denial still works.
Retain Cells ↔ Genome → Cell switching, keyboard controls, reduced motion, masks, navigation,
pause/resume, and all seven explorer forms.

## Luminous rendering

Decorative, deterministic, reversible, theme-native Canvas2D artwork. No new dependencies,
WebGL, homepage labels, cinematic story rail, guided tour, or simulation/physics changes.
RNA, cell anatomy, and expression targets remain unchanged. Rigid protein view rotation must
not alter the experimental fold. Generic network and illustrative density are not Shorkie
architecture, calibration, or a biological mechanism.

- Particle budgets remain ambient 1000/3200 and explorer 1600/5000 (phone/desktop).
- DPR remains 1.5/2; frame caps remain ambient 20/24 and explorer 30/60 FPS.
- Fit the complete hero helix inside the viewport at 320, 360, 390, 414, 768, and 1440 px.
- DNA uses two theme-token inks, gradient rungs, a moving read-head bead, and clearer strands.
- Hot-particle glow: at most 100 phone / 250 desktop sprites, palette rebuilt on theme change.
  Dark/CRT use additive light; light uses restrained source-over.
- Foreground bokeh: at most 12 phone / 28 desktop, alpha at most 0.05, 1.6× parallax.
- Transition streaks: at most one third of allocated particles, two batched strokes using
  reusable previous-position buffers. Disable below quality 0.6.
- Add travelling network packets, normal-quantile density sample rain, and a rigid protein
  turntable. Calm effect amplitude is 0.45 of Ambient.
- All animated effect counts and life amplitude are zero in Paused, reduced motion, and
  static fallback. Canvas rendering may retain static form outlines/dots.
- All artwork, including new passes, uses the existing reading-clearance mask.
- Diagnostics expose life amplitude and drawn glow/streak/rain/packet/bokeh counts.
- Cells rendering only: Ambient visual alpha at most 0.75, Calm at most 0.45, membrane rim
  and a restrained dark-theme edge glow; preserve population, mitosis, apoptosis, and physics.
- Maintain p95 draw cost below 6 ms desktop / 10 ms 390 px phone with 4× CPU throttle,
  quality 1, and no fallback across the profiler's 52 cases.

## Documentation and verification

Update background-scene documentation, README, and short CLAUDE.md traps, with measurements
reported as observed results rather than guarantees. No dependency upgrades or changes to
Scholar privacy/indexing or offline Shorkie model tooling.

Require unit tests, Astro check, edited-Astro JSX spacing check, full build followed immediately
by indexing, links/security audits, terminal/cells/background browser audits, and the 52-case
profiler. Inspect Chromium/WebKit at 1440/768/390/320 px in light/dark/amber CRT, both terminal
states, all seven chapters and explorer, plus two transition filmstrips. Cover Paused, Calm,
reduced motion, denied storage, and legacy Flow preference.

Check remote/main and the older seven-stage tip before local fast-forward integration.
No push or deploy until the user explicitly requests publication.
