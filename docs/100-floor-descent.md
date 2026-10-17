# 100-Floor Descent — 百層下樓梯

An original, non-pixel cave-descent arcade at `/games/100-floor-descent/`.
Appended to `/software/` as entry 16; the preceding fifteen entries keep their order,
destinations, and artwork. No dependencies, server, accounts, ads, or attempt limits.

## Design

Inspired by the left/right/gravity format of [NS-Shaft, by NAGI-P SOFT](https://www.nagi-p.com/v1/eng/nsshaft.html)
and the [reference 100-floor challenge](https://www.arealme.com/100-floor-challenge/zh/).
The code, course patterns, smooth vector-painted explorer, illustrations, icon, and
synthesized sounds are original; no reference game code or assets are reused.

| Expedition      | Objective                            | Abilities                       | Local record                                                        |
| --------------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------- |
| Classic         | Endless descent; 100-floor milestone | Left/right only                 | Deepest floor; survival time breaks ties                            |
| 100-floor Trial | Land alive on row 500's sanctuary    | Left/right only; no checkpoints | Fastest clear, compared only within the same seed and rules version |
| Remix           | Endless descent                      | Dash, one-hit shield, slow time | Separate from Classic                                               |
| Practice        | Start at floor 0, 20, 40, 60, or 80  | Classic controls; quick retry   | Never eligible                                                      |

Trial targets 3–5 minutes. The automated completion witnesses are precise legal-input
pilots, **not evidence that a first-time human player will find the game easy**.
They read snapshots and forecast possible steering choices, then apply ordinary
steering to the live simulation. They never set position, camera, health, floors,
platforms, or win state. Full browser witnesses also verify that a clear is saved.

### Rules, version 1

- Start with 10 health. Spike-platform landings cost 4; ceiling contact costs 5.
  Ceiling contact detaches and knocks the explorer down. Falling entirely beyond the
  bottom ends a run regardless of remaining health or shields.
- First regeneration is 1 health exactly 2 damage-free seconds after a hit, followed
  by 1 per second, capped at 10. Normal platforms do not heal. Damage protection is
  0.75 seconds; it prevents a single contact from draining health every tick.
- Five rows equal one displayed floor. Progress uses the deepest **landed** row;
  revisiting old platforms cannot farm floors. Reaching floor 100 is not enough to
  win Trial: the explorer must land alive on the final platform.
- Stone, crumble (0.45-second contact timer), spring, and left/right conveyors have
  distinct silhouettes or patterns. Springs bounce about 47 world units: visibly
  upward, but below the preceding row, avoiding involuntary upward bounce loops.
- Remix dash lasts 0.16 seconds with a 4-second cooldown and is not invulnerability.
  A shield blocks one damaging hit and cannot stack. Slow time lasts 3 active seconds:
  cave scrolling, falling, and platform timers use 65% world speed; steering,
  cooldowns, effect duration, and the active run timer remain unscaled.
- Share links contain `mode`, uint32 `seed`, and `rules=1`; Practice also includes
  `start`. Unknown modes, invalid seeds, and invalid checkpoints are rejected or
  normalized. An unsupported rules version displays a comparison warning.

### Course construction and balance

The logical cave is 420 × 600. Physics uses 120 Hz fixed steps and swept one-way
landing checks; rendering interpolates between simulation positions. Scrolling
starts at 90 world units/s, reaches 190 at floor 100, and caps at 230 in endless
play. Horizontal speed was tuned to 300 units/s for responsive late-game steering.
Refresh rates of 30, 60, and 144 Hz produce identical ordinary-budget simulations.
Long stalls have a bounded catch-up budget rather than a dangerous large time step.

The original kit uses seeded ten-row patterns, three compatible lanes, small bounded
jitter, and 70-unit row spacing. Main platforms taper from 114 to 92 units, leaving
room to descend rapidly. The first platform and final Trial approach are broader.
Conveyors begin at floor 5, crumble at 9, optional springs at 13, and spike traps at 17.
Springs and spikes are optional side platforms, never replacements for the main route.
Every mirrored chunk connector stays inside the same reachability envelope. An
invalid kit entry takes a bounded alternating-pattern fallback, not an unbounded
random retry loop. Geometry checks cover 64 seeds × 500 transitions; full input
witnesses cover seeds 1, 42, 2026, and 4294967295. This is not a mathematical proof
of every possible seed or human strategy.

### Art and interface

Five twenty-floor regions: Lantern Gate, Mosslight Hollow, Crystal Gallery,
Clockwork Well, and Ember Vault. Region palettes morph with continuous descent
progress; the final palette persists in endless play. Practice opens directly in
its selected region. Quiet atmospheric depth, lamps, stonework, vegetation,
crystals, and machinery frame the playfield. The explorer has a helmet lamp,
backpack, scarf, running/falling poses, landing squash, and a dash trail. Shapes,
chevrons, cracks, and teeth communicate platform types without color alone.

The English/Traditional Chinese switch is local to the game. Switching language,
sound, or visual/input settings pauses and preserves a run. Changing mode/seed
starts a fresh expedition, and those controls are disabled during play. Records,
settings, and challenges are separate from all other games. Storage uses only
`khc-floor-descent-v1-settings` and `khc-floor-descent-v1-records`; when denied or
full, settings and records continue in session memory with a visible notice.
The most recent 24 improved Trial seeds are retained. No live run is persisted.

Keyboard: Left/Right or A/D, Enter to begin, P to pause, Space/J to dash in Remix.
Touch: hold direction buttons (56 CSS pixels minimum), with optional cave-half
steering and a separate dash button. Pointer exit, cancellation, lost capture,
blur, and teardown release controls. Page scrolling works outside the cave.
Focus view fits the complete logical world in portrait and landscape; native
fullscreen is optional. Sound is muted initially. Reduced motion disables decorative
parallax, particles, squash, and trails while preserving essential game motion.
Blur, hidden tabs, and offscreen play pause the clock and cancel the animation loop.

## Code seams

- `src/lib/floorDescent.ts`: browser-free simulation, bounded read-only forecasting,
  run status, health, collisions, abilities, and results.
- `src/lib/floorDescentCourse.ts`: stateless seeded course kit and pattern fallback.
- `src/lib/floorDescentSave.ts`: validated settings, records, and challenge links;
  storage is injected and optional.
- `src/lib/floorDescentText.ts`: typed English/Traditional Chinese dictionary.
- `src/scripts/floorDescent.ts`: browser input, audio, lifecycle, persistence, and DOM.
- `src/scripts/floorDescentRenderer.ts`: original Canvas2D artwork, bounded DPR ≤2.
- `scripts/lib/floorDescentAgent.mjs`: shared pure-engine/browser input witness.

These approved engine, browser, and catalog seams carry the tests. Existing shared
`GameTools`, fixed clock, and safe DOM label updates are reused, not the unrelated
three-game campaign shell. Astro navigation destroys listeners, observers, sound,
and animation ownership before mounting a single new controller.

## Verification and maintenance

```sh
npm test
npm run check
npm run build
npm run audit:indexing
npm run audit:links
npm run audit:security
npm run audit:floor-descent
GAME_UI_AUDIT_GAMES=100-floor-descent npm run audit:games
npm run audit:software
python3 scripts/check-jsx-spacing.py src/pages/games/100-floor-descent.astro src/pages/software.astro src/components/games/FloorDescentLogo.astro
```

The dedicated browser audit starts/stops an owned production preview unless
`DESCENT_UI_BASE_URL` supplies an existing server. `DESCENT_UI_BROWSERS=chromium`
or `webkit` filters engines; `--quick` skips the long completion witness and larger
profile matrix. Evidence defaults to `/tmp/khc-floor-descent/`, including browser
screenshots and bounded rendering measurements. Full checks cover desktop, 390px
phone, 320px narrow phone, and 844 × 390 landscape, six site themes, both languages,
touch cancellation, Focus fit, reduced motion, storage denial, saved clears, and
ClientRouter teardown/remount. Run against a production preview: Astro's local
development toolbar itself requires localStorage and can emit unrelated errors
when the storage-denial audit is run against `astro dev`.

Phone viewports and touch in Playwright are **emulated on a desktop**, not physical
iOS/Android performance certification. Reported draw times are local samples, not
Core Web Vitals or guarantees for every device. A physical phone playtest remains
useful for subjective balance, thumb reach, sound, and browser chrome behavior.

No additional gates were added to push CI. Build/PDF generation and the existing
indexing, link, and static-security audits remain the deployment checks; detailed
game/browser audits remain local/manual.
