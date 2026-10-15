# Proofreader 3D — implementation and verification

## Direction and scope

Proofreader v3 replaces the pixel-art, single-height raycaster with a WebGL2 FPS.
The approved direction is a biotech/organic hybrid, tactical-arcade combat, six
deeper missions, grounded vertical movement, all weapons available immediately,
desktop and phone play, and checkpoint retries. It is single-player and non-gory.
Snake and Jetpack remain pixel-art games using their existing v2 rules.

Artwork is original procedural geometry, smooth vector identity, and smoothly
filtered code-drawn material detail. There are no downloaded model packs, remote
asset dependencies, accounts, tracking, or mandatory paid services.

## Module interfaces and geometry

`proofreaderWorld` owns shared geometry, the static Octree, capsule resolution,
step-up, sight lines and floor-aware navigation. `proofreaderLevels` contains the
six authored semantic maps. `proofreader` owns serializable simulation state,
weapons, enemies, supplies, objectives, checkpoints and results. `proofreaderScene`
is a WebGL presentation; `proofreader` in scripts translates browser inputs and
updates readable HTML HUDs. Gameplay never depends on rendered pixels or GPU hits.

One level definition supplies the triangles used for both visible terrain and
collision. Doors share their animated positions with the collider; crates share
their extents and removal state. Holograms are decorative and deliberately not
solid. The simulation runs at 120 Hz, with interpolated rendering and independent
cosmetic effects. Positions are feet in a Y-up world; yaw zero faces −Z.

The shared arcade runtime accepts a presentation adapter instead of requiring a
2D canvas context. The Canvas2D adapter retains Snake/Jetpack behavior. The WebGL
adapter owns sizing, GPU resources, rendering and disposal. No new engine or
physics dependency was required.

References: [Three.js r185 FPS example](https://github.com/mrdoob/three.js/blob/r185/examples/games_fps.html),
[Octree implementation](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/math/Octree.js).
The example is a foundation, not an assertion that its minimal physics is suitable
unchanged: navigation clearance, step-up, deterministic time, lifecycle and gameplay
tests are specific to this implementation.

## Campaign

| Sector           | Space and objective                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Replication Fork | Two-floor forked atrium; clear encounters, activate the bridge console, exit.                    |
| Cover Circuit    | Maintenance ring with staircase, ramp and wide upper flanking bridge; two relays.                |
| Gap Chamber      | Three-tier bioreactor; restore bridge power, then stabilize the upper reactor.                   |
| Supply Run       | Three-floor storage archive with connected aisles; recover three packets and return.             |
| Signal Lock      | Three-floor observatory; disable two emitters and defend the marked control zone for 45 seconds. |
| Fidelity Core    | Three-tier guardian arena; disable a different shield relay in each of three phases.             |

Every required destination has a ramp/stair route. Jumps are optional. Branches,
bridges, passages beneath platforms, waist-high cover, tanks, crates, doors and
telegraphed vents/barriers provide variety. The maps use a common architectural
kit, with distinct partitions, routes, elevations, objectives and encounters.

The 5–8 minute mission length is a human-play balancing target, not a measured
guarantee. The unusually precise completion witness is substantially faster than
a new visitor exploring and learning the game.

## Combat and controls

- Carbine: accurate hitscan fire, 24-round magazine, 120 reserve, 1.2-second reload.
- Scatter: seven close-range pellets, six-round magazine, 30 reserve, 1.6-second reload.
- Pulse: visible explosive projectile, three-round magazine, 15 reserve,
  1.8-second reload. Cover blocks splash damage; there is no friendly/self splash.
- Scouts reposition; chargers telegraph and commit; sentries have frontal plates;
  drones make vertical aim useful; the guardian has three separately shielded phases.
- Ammunition terminals refill without awarding points. Supplies are bounded and
  deterministic. Practice prevents damage and does not consume magazines.

Desktop: WASD move, mouse/drag aim, click/F fire, Space jump, Shift sprint, R reload,
E use, 1–3 select, Q cycle, M map, P pause. Arrow keys provide digital aim. Controls
can be remapped. Pointer lock is optional; Escape releases and pauses.

Touch: left movement stick, right look area, Fire-drag for simultaneous aim/fire,
Jump and Sprint, with weapon/reload/contextual-use controls. A full-forward stick
sprints. Separate pointer and keyboard sources prevent release from stranding or
cancelling another held input. Focus view supports portrait and landscape.

Sound is off by default. Weapon sounds use distinct synthesized envelopes.
Reduced motion disables decorative rotation/dust and weapon sway without changing
simulation rules. FOV, sensitivity, assistance, dead zone and motion are adjustable.

## Checkpoints, records and compatibility

Safe checkpoints require no nearby visible threats or incoming hostile projectiles.
They restore integrity and ammunition once and capture an independent world snapshot.
Defeat offers checkpoint retry; Restart resets the mission. Retry restores world,
objectives, ammo and score, preserves total attempt time and retry count, and cannot
duplicate rewards. Checkpoints last only for the current visit.

Retried clears unlock the next sector but create no ranked records or medals.
Uninterrupted clears can earn clear, 70% shot accuracy and no-damage medals.
Each scatter volley/explosion counts once if it damages at least one enemy.
Assisted and Standard/Expert records remain separate; Practice creates no progress.

Proofreader uses `khc-arcade-proofreader-v3` and settings-v3. Old v2 and scalar
records are not overwritten. Compatible sound/control comfort settings migrate;
old key bindings do not, since Space is now Jump. Previous-edition challenge links
show a notice and do not claim identical replay. Snake/Jetpack keep their v2 keys.

## Performance, lifecycle and accessibility

Auto/Low/High adjust rendering resolution and decorative detail, never rules.
Pixel ratio is capped. Terrain and repeated architectural detail are merged or
instanced, including the DNA hologram's two strands and rungs in four batches
instead of 110 separate draws. Actors, projectiles, pickups and effects are pooled/bounded. No heavy
post-processing pipeline is required. All geometry, textures, materials, audio,
observers and listeners are released on navigation.

Hidden, unfocused and offscreen games pause and release inputs. There is no idle
or paused RAF loop. WebGL context loss pauses; restoration waits for explicit
Resume. Missing WebGL2 produces an HTML explanation with a retry button and keeps
the guide available. Aim/attack/objective cues use shape and text as well as color.

Targets are 60 fps desktop and 30 fps phone. Headless browser measurements are
development evidence, not physical-phone performance certification. A phone-sized
viewport and touch emulation do not measure an actual phone GPU or battery.

## Verification and release

The pure-engine suite covers all six sectors in Standard and Expert through legal
inputs, plus geometry, ramp/stair movement, jumping, visibility, weapon roles,
supplies, guardian shielding, projectiles, pauses, checkpoints and versioned data.
The witness reads the actual state and issues ordinary controls; it never teleports,
grants health/ammo, removes enemies or forces a win. Its success is not human balance QA.

Two navigation regressions were minimized and locked down: a capsule fully inside
a thick box does not touch its surface triangles, and center-line-only path checks
can cut off a ramp. Navigation now rejects solid interiors and checks the actor's
footprint, headroom and intermediate support along connections.

A third regression test ensures custom ramp geometry has the same vertex
attributes as boxes/stairs, so terrain batching cannot silently omit visible
surfaces. Browser checks also verify active touch buttons are at least 44 CSS
pixels in both dimensions, retain their round styling, and never clip their
labels. This catches shared arcade CSS overriding game-specific controls; these
controls intentionally hide while paused.

Local/manual commands (not added to push CI):

```sh
npm test
npm run check
npm run audit:proofreader
ARCADE_UI_GAMES=proofreader GAME_UI_AUDIT_BASE_URL=http://127.0.0.1:4321 npm run audit:arcade
ARCADE_TEST_BROWSERS=chromium,webkit ARCADE_TEST_GAMES=proofreader,snake,jetpack-joyride npm run test:arcade-controls
npm run build
npm run audit:indexing
npm run audit:links
npm run audit:security
```

Browser artifacts live in `/tmp/khc-proofreader-3d` and `/tmp/khc-arcade-campaigns`.
The release keeps the existing lightweight production build/PDF/indexing/link/security
workflow. Completion of release checks and production smoke verification is recorded
below only after those checks actually run.

### Local release evidence — 15 October 2026

- Full unit suite: 4,499 passed, 350 skipped, across 94 test files. Astro checks:
  zero errors and zero warnings.
- All six Standard and Expert missions clear through legal inputs in the pure
  engine. Chromium and WebKit also clear the complete Standard campaign and
  preserve unlocks and cosmetic selections after reload.
- Both browsers cover all six themes at 1440, 390, 320 and landscape 844-pixel
  viewports, including Focus view, reduced motion and pause stability.
- Dedicated WebGL checks cover two-axis aim, simultaneous touch movement and
  Fire-drag aiming, jumping, three weapons, context loss/recovery, checkpoint
  retry, previous-edition records and the no-WebGL fallback.
- Shared Proofreader/Snake/Jetpack control regressions pass in both browsers;
  all 16 audit-runtime/preview lifecycle tests pass.
- Production build/PDF generation and indexing, link and security audits pass
  locally. The push workflow remains unchanged; deployment is checked through
  the GitHub Pages workflow after the release commit is pushed.
