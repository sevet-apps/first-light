# FIRST LIGHT — Design Bible

> *Build it. Launch it. Bring home first light.*
> A first-person space-mission design game for the NASA Space Apps Challenge (Space Mission Design Game).

This document is the single source of truth for every ticket. If a ticket and this document disagree, ask the lead (do not guess).

---

## 1. Experience pillars

1. **Scale and awe.** A person is tiny next to a 50 m rocket inside a 70 m tall high bay. Space is vast; the satellite is a small bright object against Earth, stars and the Sun.
2. **My hands built this.** Every part on the satellite was carried and installed by the player. The launch and orbit scenes show *exactly that* configuration.
3. **Choices have consequences.** Mass, cost, power, data rate and storage visibly shape what happens in orbit, and the debrief explains why.
4. **Cinematic cohesion.** Intro, hangar, launch, orbit and debrief share one palette, one UI language and one sound world.

## 2. Game loop (one complete mission in v1)

```
Title (click to start, audio unlock)
  → Intro film (28 s real NASA/ESA footage, VO, music, subtitles; skippable)
  → Hangar (first person)
      1. Read mission brief at MISSION CONSOLE
      2. Assemble satellite at INTEGRATION STAND: Bus → Instrument, Solar, Battery, Antenna (any order after bus)
      3. Run READINESS CHECK at console (budget, mass, power, compatibility, data analysis)
      4. INTEGRATE PAYLOAD: satellite → payload adapter → fairing closes → crane lifts to rocket top
      5. LAUNCH CONTROL desk → begin countdown
  → Launch (3D cinematic of THIS rocket with THIS satellite)
      countdown, ignition, liftoff, booster sep, stage sep, fairing jettison, satellite sep, panel deploy
  → Orbit operations (player controls modes for 3 orbits, ~3 min real time)
  → Debrief (success/failure, stars, reasons, suggestions)
      → [Redesign] back to hangar with current assembly (swap parts) → re-launch
      → [Replay intro] / [Main menu]
```

Mission v1: **"FIRST LIGHT" — Earth-observation satellite LUMEN-1.** Image wildfire-risk regions and deliver at least the goal amount of image data to ground stations within 3 orbits.

## 3. Components and mission model

Categories and options (final numbers tuned and verified in T2 — `tests/sim.html`). Each option is a physical part on a rack in the hangar.

| Category | Id | Name | Mass kg | Cost $M | Key stats |
|---|---|---|---|---|---|
| Bus (structure, avionics, storage) | `bus_micro` | MB-40 Microsat Bus | 40 | 5 | base load 30 W, storage 2 000 MB, max instrument 12 kg, no 4-panel array, no X-band |
| | `bus_small` | SB-90 Smallsat Bus | 90 | 11 | base load 65 W, storage 8 000 MB, accepts everything |
| Instrument | `inst_wfc` | WFC-30 Wide-Field Camera | 9 | 4 | 45 W, 70 MB/min, 30 m resolution |
| | `inst_hri` | HRI-5 Hi-Res Multispectral Imager | 24 | 15 | 290 W, 160 MB/min, 5 m resolution |
| Solar | `sol_body` | Body-Mounted Cells | 4 | 1.5 | 55 W |
| | `sol_2wing` | DSA-2 Deployable 2-Wing Array | 12 | 5 | 190 W |
| | `sol_4panel` | DSA-4 Four-Panel Array | 22 | 9 | 480 W, needs SB-90 |
| Battery | `bat_120` | LB-120 Li-ion Pack | 3 | 1 | 120 Wh |
| | `bat_400` | LB-400 Li-ion Pack | 9 | 3 | 400 Wh |
| Antenna | `ant_uhf` | UHF Whip | 1 | 0.5 | 8 W, 10 MB/min |
| | `ant_sband` | S-Band Patch | 2 | 2 | 60 W, 70 MB/min |
| | `ant_xband` | X-Band Dish | 6 | 6 | 120 W, 400 MB/min, needs SB-90 |

Mission constraints: budget **$38 M**, launcher capacity **180 kg** to 550 km sun-synchronous orbit, goal **2 400 MB** delivered. The "best of everything" build costs $44 M, so the player must choose where to compromise. Verified viable builds: *balanced* (S-band, big battery), *budget* (microsat, wide-field camera — 2 stars max), *fastlink* (X-band, small battery — needs careful piloting around eclipses for 3 stars), *bigsolar* (big array, small battery, slow S-band).

### Pre-launch readiness check
- **Blockers** (cannot integrate): missing part, over budget, over mass, incompatible part.
- **Warnings** (allowed, explained): negative orbit-average power, battery cannot cover eclipse with nominal loads, max achievable data < goal, storage < one orbit of imaging, slow downlink.
- Every line is plain English: *what*, *why it matters*, *what would fix it*.

### Orbit simulation (deterministic, pure functions in `src/sim/`)
- 3 orbits × 95 sim-min. Real time at 1×: 1 orbit ≈ 60 s. Warp 1×/2×/4×.
- Each orbit: ~35 % eclipse. 2 imaging target windows (sunlit, ~7 min) and 2 ground-station passes (~8 min); at least one pass falls in eclipse and at least one target overlaps a pass (forces a decision).
- Player picks one mode at a time: **SUN-POINT** (charge, 100 % solar), **IMAGE** (55 % solar, instrument load, collects data only over a target), **DOWNLINK** (55 % solar, transmitter load, sends data only during a pass).
- Battery 0 % → **SAFE MODE** for 10 sim-min (forced sun-point, everything off), logged.
- Memory full → new imagery is lost, logged.
- Result: delivered MB vs goal; stars: ★ success, ★★ no safe mode, ★★★ ≥ 130 % goal.
- Debrief reasons derive from the event log (eclipse depletion, data lost, unused passes, link too slow, etc.).

## 4. Technical architecture

- **No build step.** Plain ES modules, served statically (GitHub Pages compatible). Local dev: `python tools/serve.py` (port 8080, no-cache headers).
- **three.js r170**, vendored in `vendor/three/` and mapped by an import map: `three` → `vendor/three/build/three.module.js`, `three/addons/` → `vendor/three/examples/jsm/`.
- Units: **1 unit = 1 m**, Y up, player eye height 1.70 m, walk 3.2 m/s, run 6.5 m/s.
- One shared `WebGLRenderer` (ACES Filmic, sRGB output, PCF soft shadows). Post: `EffectComposer` → RenderPass → UnrealBloom (subtle) → OutputPass; optional FXAA/SMAA.
- Scene manager: each scene module exports `{ id, enter(ctx, params), update(dt), exit(), onResize() }`; scenes own and dispose their resources.
- Game state (`src/state.js`): mission config, current assembly, last result, settings (persisted in localStorage with try/catch).
- Audio: `AudioManager` with buses master / music / voice / sfx / ambience (WebAudio GainNodes), settings sliders, ducking for VO.
- Input: pointer-lock mouse look with **drag-to-look fallback** when pointer lock is unavailable; WASD/arrows, Shift run, E interact, Q drop, Tab/Esc pause.
- **Debug & test hooks** (always present, overlay only with `?debug=1`): `window.__fl = { state, goto(sceneId, params), scene, player:{teleport(x,y,z,yawDeg,pitchDeg), get()}, input:{hold(code, ms)}, interact(), sim, log }`. URL params: `?scene=hangar|launch|orbit|debrief|intro|title`, `?assembly=preset_name`, `?warp=8`. These hooks make every feature verifiable from automation.

### Folder layout
```
index.html            css/          src/
  src/main.js         src/core/ (renderer, scenes, input, audio, assets, ui, debug)
  src/data/ (components.js, mission.js)
  src/sim/ (assembly.js – checks, orbit.js – simulation)
  src/scenes/ (title, intro, hangar/*, launch, orbit, debrief)
assets/models/*.glb   assets/textures/   assets/audio/   assets/video/   assets/subtitles/
blender/*.py          (every model is generated by a Blender script; run headless)
tools/                (serve.py, audio synthesis, intro edit scripts)
docs/                 (DESIGN.md, TICKETS.md, previews/ screenshots)
```

### Blender pipeline (mandatory)
- All game models (hangar, rocket, fairing, satellite parts, equipment) are produced by Python scripts in `blender/` run with
  `blender -b --factory-startup -P blender/<script>.py`, exporting **glTF binary** to `assets/models/`.
- Naming contract inside GLBs: `SOCKET_<slot>` empties for attach points (e.g. `SOCKET_instrument`, `SOCKET_solar`, `SOCKET_battery`, `SOCKET_antenna` on bus models); `COL_<name>` box meshes for collisions (hidden in game); `INTERACT_<id>` empties for interaction anchors.
- Materials: Principled BSDF only with image textures (procedural nodes must be **baked** to PNG/JPG before export). Keep textures ≤ 2048, prefer 1024.
- Animations exported as glTF actions where needed (solar panel deploy, fairing halves).
- Each script also renders a preview PNG to `docs/previews/` (Eevee) for review.

## 5. Art direction

**Mood:** blue-hour industrial cathedral → fire and thunder → silent black infinity with a luminous Earth.

**Hangar.** Vast vertical space, cool steel-blue ambient (#1a2330 → #3b4a5e), shafts of warm light (#ffb46b) from high clerestory windows, crisp white LED strips on catwalks, light haze/fog that reveals depth, floating dust motes in light shafts. Clean-room integration zone with white epoxy floor, yellow/black safety markings, blue anti-static mats. Rocket: clean white (#e9ecef) with dark grey interstage, subtle panel lines, mission decal "LUMEN-1 · FIRST LIGHT". Human-scale props (railings, toolboxes, carts, gas bottles, cable trays, signage) everywhere to sell the scale.

**Satellite.** Gold/amber MLI foil with crinkled normal map, anodized aluminium frames, deep-blue solar cells with silver grid lines, white radiator panels, small specular highlights. Must read clearly from 2 m and from 30 m in orbit.

**Launch.** Golden-hour sunset pad (warm horizon, deep blue zenith), blinding white-yellow exhaust core with orange edges (bloom), billowing grey-white smoke, camera shake and low-frequency rumble; sky darkens to black, Earth curvature appears.

**Orbit.** Pure black space, dense subtle starfield (no over-bright stars), NASA Blue Marble Earth with thin blue atmospheric rim, night-side city lights, clouds, a hard bright Sun with lens glare. Terminator crossing makes the satellite go dark and the UI shift to battery-discharge state.

**UI language — "Flight Manual" (chosen by the product owner, binding).** The interface is a set of printed mission documents over the 3D world: warm paper, black ink, one signal red; Instrument Serif titles, Inter text, generous sizes, rounded corners, soft deep shadows, calm motion. Full specification: [`docs/UI_STYLE.md`](UI_STYLE.md). Anything that looks like a generic sci-fi HUD (cyan glow, tiny monospace, sharp boxes) is a defect.

**Sound world.** Hangar: deep HVAC drone, distant metallic clanks, reverberant footsteps (concrete vs metal), servo whirs, torque-wrench zips, satisfying "clunk" on install. Launch: sub-bass rumble, crackle, roar that swells and muffles with altitude to silence. Orbit: near silence, soft synth pad, UI chirps, data-link telemetry chirps. Music: warm cinematic pads, slow build, never busy.

## 6. Quality bar (Definition of Done for every ticket)
1. No console errors or warnings from our code on load and during the feature.
2. Feature demonstrably works in the running game (lead verifies via screenshots + debug hooks).
3. 60 fps target at 1920×1080 on a desktop GPU; no frame spikes > 50 ms during normal play (except scene loads behind a loading screen).
4. Text readable at 1280×720 and 1920×1080; nothing overlaps; English only; every UI element follows `docs/UI_STYLE.md`.
5. Code: small focused modules, no dead code, no copy-paste duplication, resources disposed on scene exit.
6. Commit with a clear message; push to `origin main`.

## 7. Sources and credits
All real footage is from NASA and ESA (see `CREDITS.md`). NASA imagery is generally not copyrighted; ESA material is used under its standard terms with attribution. Earth textures: NASA Visible Earth (Blue Marble, Black Marble). No NASA/ESA logos are used as game branding.
