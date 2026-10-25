# Proofreader Classic restoration

Restored on 2026-10-24 from `de01fa48`, the last pixel-art campaign before the true-3D rewrite. This is a preserved **Canvas2D raycast (2.5D) FPS**, not a top-down game and not a downgrade of the current WebGL game.

## What visitors see

- `/games/proofreader-classic/` preserves the original six sectors, enemies, cover, supplies, relays, guardian, precision shots, and three-charge piercing pulse.
- Campaign, endless survival, and unranked practice retain Standard/Expert difficulty, deterministic seeds, medals, and cosmetic palette unlocks.
- The original 320×240 pixel renderer and SVG icon are restored. Keyboard/mouse and two-thumb movement/aiming use the current accessible arcade shell and lifecycle protections.
- Classic appears immediately after Proofreader on Software. Both game pages have a labeled edition switcher. The existing `/games/proofreader/` game, three weapons, vertical levels, and checkpoints remain intact.
- Biological explanations explicitly distinguish the arcade metaphor from actual Pol III proofreading and do not imply that all variants are harmful.

## Isolation and compatibility

The restored engine, browser controller, renderer, and historical tests use `proofreaderClassic` names. Classic has its own `proofreader-classic` arcade identity, `proofclassic` DOM prefix, and `__proofreaderClassic` browser audit hook. Its six campaign definitions and rules version 2 are distinct from the current 3D game's rules version 3.

Classic uses `khc-arcade-proofreader-classic-v2` and `khc-arcade-proofreader-classic-settings-v2`. On first use only, valid original `khc-arcade-proofreader-v2` progress and compatible v2 settings are sanitized and copied into absent Classic keys. Original keys and 3D keys are never changed or merged. Existing Classic keys are not overwritten; malformed or denied storage safely falls back to a fresh game or in-memory progress.

Classic challenge URLs use the Classic route and `rules=2`. The edition switcher intentionally does not transfer an incompatible challenge query between games. Historical challenge URLs on the 3D route continue to display the existing version-mismatch notice rather than silently changing destination.

Shared Snake/Jetpack rendering and 3D gameplay modules were not rolled back. Modern pause, Focus view, input release, sound settings, reduced-motion behavior, and Astro navigation cleanup are retained. The new Classic bundle does not import the 3D scene or Three.js.

## Footer behavior

`footerHidden` is separate from the existing header-navigation flag. Deep Dives, Papers, NN Lab, Fun Lab, Photos, Projects, and CV are hidden only from the shared footer. Their pages and navigation registry remain, and Deep Dives remains in both header menus. Branding, contact/social links, appearance controls, and the other footer destinations are unchanged.

## Local verification

- `npm run check`: no errors or warnings; existing informational hints remain.
- `npm test`: 4,591 tests passed, 350 existing skips across 102 test files.
- `npm run build`, then `npm run audit:indexing`: production HTML and PDF generation passed; Scholar/indexing invariants passed.
- `npm run audit:links` and `npm run audit:security`: passed.
- JSX-spacing checks passed on all changed Astro files.
- Classic campaign witnesses completed all six sectors on Standard and Expert in Chromium and WebKit without editing gameplay state or forcing wins. These establish completion, not human balance.
- Classic layout checks passed at widths 320, 390, 768, 844 (landscape), and 1440 in six themes, including paused pixels, touch targets, and Focus exit.
- Dedicated Classic checks passed in both browsers: metadata/Canvas2D, save copying, corrupt/denied storage, touch movement and aiming, pulse, pause, sharing, cross-edition teardown, browser history, and footer/header destinations.
- Existing 3D checks passed in both browsers: desktop/phone aiming, weapons, jumping, input release, pause/context recovery, checkpoint retry, historical-save preservation, and unavailable-WebGL fallback.
- Shared controls passed for Classic, 3D, Snake, and Jetpack in both browsers. The shared Classic game-page audit passed desktop-light, phone-dark, and reduced-motion/storage-denied cases.
- The Software catalog passed all 24 browser/layout/theme profiles, including 320/390px phones, tablet, and desktop. All 17 entries, distinct icons, destinations, terminal ordering, touch targets, and fourteen in-house game-header icons were verified.
- All nineteen browser-audit runtime/helper tests passed, including Classic held-press pause/resume, the built-file transport's path restrictions, and real-server startup, shutdown, failure, and interruption cleanup.

Initial verification could launch permitted browsers but could not connect to localhost, so it used the optional **local-only** `GAME_UI_AUDIT_OFFLINE=1` built-file transport, following the existing PDF generator's technique. It intercepts same-origin requests from `dist/`, blocks external requests, and does not change normal preview/live behavior or push CI. During final release verification on 2026-10-25, localhost connectivity worked and the entire real-server/runtime suite passed normally, closing the earlier preview-process/port lifecycle coverage gap.

Example repeatable commands after building:

```sh
GAME_UI_AUDIT_OFFLINE=1 npm run audit:proofreader-classic
GAME_UI_AUDIT_OFFLINE=1 ARCADE_UI_GAMES=proofreader-classic npm run audit:arcade -- --campaigns-only
GAME_UI_AUDIT_OFFLINE=1 ARCADE_UI_GAMES=proofreader-classic ARCADE_UI_DIFFICULTY=expert npm run audit:arcade -- --campaigns-only
GAME_UI_AUDIT_OFFLINE=1 ARCADE_UI_GAMES=proofreader-classic npm run audit:arcade -- --presentation-only
GAME_UI_AUDIT_OFFLINE=1 npm run audit:proofreader
GAME_UI_AUDIT_OFFLINE=1 node --test scripts/lib/gameAuditActions.test.mjs scripts/lib/builtSiteBrowser.test.mjs
```

Evidence defaults to `/tmp/khc-proofreader-classic`, `/tmp/khc-arcade-campaigns`, `/tmp/khc-proofreader-3d`, and `/tmp/khc-game-ui`; screenshots are local review artifacts, not production assets. Release to `main` is authorized after final local verification. The existing Pages workflow publishes the site, and the existing manual full game audit will run once for this release to cover real-server lifecycle checks. The release SHA, workflow results, and production verification are reported at handoff. Future push CI remains unchanged.
