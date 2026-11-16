# Visual update — 16 November 2026

The local game is served at `http://127.0.0.1:8090/`. Reload an existing browser tab with Ctrl+F5.

## Changes

- Antenna mounts now share a contact frame whose normal points out of the bus front face. The X-band dish has a continuous base, rim and feed supports. Flight effects originate at the antenna tip.
- Sign masts sit behind their panels with attached brackets and feet. Cart handles have continuous uprights; cargo rests on the deck. Rocket bands use open sleeves with clearance. The high-bay door has separate panels, side rails, header, a wall opening and a movement collider.
- Two more physical modules are installed with the existing carry/install/bolt animations: OBC-1 flight computer and ADCS-1 attitude control. Both buses have sockets for them, and a new Flight Systems rack supplies them. The complete builds retain their previous mass, cost, power and mission results: 6 kg and $1 M were separated from each bus into these two modules.
- Original Blender assets add workbenches, tools, flight-system cabinets, service conduits, power boxes, bollards and rotating ventilation fans. Large additions have colliders. Foil normals and solar-cell details are baked bitmap textures.
- Earth uses local NASA-derived surface, terrain-normal, elevation, ocean-specular, cloud and city-light maps. Terrain, clouds, night lights and atmosphere have separate geometry. The planet's sunlit hemisphere stays illuminated during spacecraft eclipse.
- Bounded survey footprints and labelled station pins replace the long amber ribbon. Imaging and downlink effects have softer colours. The spacecraft turns towards the selected target or station and its solar wings continue to track the Sun.
- Orbit has satellite/Earth camera presets, smooth orbit/zoom, a pause for exploring and an unobstructed view mode. HUD updates run at 10 Hz; marker-label placement runs at 20 Hz. Shader compilation and the first render happen during loading; hidden imaging/downlink effects are compiled before operations begin. High quality caps pixel ratio at 1.5 and uses 2× multisampling.

## Controls

| Context | Control | Action |
| --- | --- | --- |
| Hangar | Click, Esc | Capture/release mouse; pause menu |
| Hangar | WASD, Shift, Space | Walk, run, jump |
| Hangar | E, Q | Interact, return a carried part |
| Orbit | 1, 2, 3 | Sun-point, image, downlink |
| Orbit | Drag, wheel | Orbit the camera, zoom |
| Orbit | V | Satellite / Earth view |
| Orbit | P | Pause/resume mission time while viewing |
| Orbit | H | Hide/show instruments |

## Verification

- `/tests/sim.html`: 56/56 expectations, deterministic result hash `d153ac0b`; viable builds and budget trade-offs preserved.
- `/tests/assembly.html`: 92/92 checks of presets, sockets, install/swap/remove animations, weight and build-sheet values.
- `/tests/hangar.html`: 103/103 checks of collisions, wall/door contact, standing points, focus, jumping and landing.
- `/tests/audio.html`: four compatibility checks for modern and Firefox-style audio listeners, including unavailable spatial audio.
- `/tests/visual.html`: 18/18 checks, including antenna orientation on both buses, module/instrument clearance, finite module-card figures, Earth layers, V/P/H controls, imaging/downlink, eclipse lighting, debrief/redesign and GPU resource counts across repeated scene changes.
- Across four hangar/orbit round trips, geometry counts warmed from 147 to 150 and then stayed at 150; textures stayed at 30. No continuing resource growth was observed.
- Active imaging at a 1280×684 viewport used 57 draw calls. The RAF timing sample had a 7.0 ms median but approximately 1000 ms gaps when the test tab was throttled in the background. This is not a representative foreground FPS measurement; Firefox smoothness remains a manual playtest item.
- `git diff --check` and Python syntax checks for the asset generators and local server passed.

Useful direct views: `/?scene=hangar&assembly=fastlink`, `/?scene=orbit&assembly=fastlink&guide=0`, `/?scene=debrief&assembly=fastlink`.

Debug hooks: `__fl.hangar.gotoStation('rack_systems')`, `__fl.hangar.assembly.autoAssemble('fastlink')`, `__fl.hangar.integrate({hold:true})`, `__fl.hangar.integration.seek(seconds)`, `__fl.orbit.setView('earth')`, `__fl.orbit.explore(true)`, `__fl.orbit.events()`, `__fl.orbit.skipTo(index, 'smart', -1)`, `__fl.orbit.setMode('DOWNLINK')`. `__fl.transitioning` reports an active scene transition.

## Screenshots

- [Earth overview](previews/visual-pass/earth-orbit.jpg)
- [Assembled spacecraft and corrected antenna](previews/visual-pass/satellite-assembly.jpg)
- [Flight computer on the Flight Systems rack](previews/visual-pass/flight-computer-location.jpg)
- [Imaging operation](previews/visual-pass/orbit-imaging.jpg)
- [Continuous cart handle](previews/visual-pass/cart-fixed.jpg)
- [Sectional high-bay door](previews/visual-pass/highbay-door.jpg)
- [Workshop decoration](previews/visual-pass/workshop.jpg)
- [Blender flight-system modules](previews/visual-pass/flight-systems.png)

## Source and assets

- Geometry and materials: `src/data/sockets.js`, `src/scenes/hangar/placeholderWorld.js`, `src/scenes/hangar/placeholderKit.js`, `src/scenes/shared/placeholderParts.js`, `src/scenes/shared/satelliteModel.js`, `src/scenes/shared/satelliteMaterials.js`, `src/scenes/shared/detailModels.js`.
- Expanded assembly: `src/data/components.js`, `src/data/presets.js`, `src/scenes/hangar/layout.js`, `src/scenes/hangar/index.js`, `src/scenes/hangar/objectives.js`, `src/ui/buildSheet.js`, `src/ui/panels.js`.
- Orbit and Earth: `src/scenes/shared/earth.js`, `src/scenes/orbit/world.js`, `src/scenes/orbit/cameraRig.js`, `src/scenes/orbit/effects.js`, `src/scenes/orbit/markers.js`, `src/scenes/orbit/hud.js`, `src/scenes/orbit/index.js`, `src/scenes/orbit/debug.js`, `src/scenes/debrief.js`, `css/hud.css`.
- Loading and diagnostics: `src/core/renderer.js`, `src/core/sceneManager.js`, `src/core/debug.js`.
- Original model/texture generator: `blender/flight_details.py`; output `assets/models/flight_details.glb`, `assets/textures/satellite/*`, and `docs/previews/visual-pass/flight-systems.png`.
- Earth-map preparation: `tools/earth_assets.py`; output `assets/textures/earth/*`, including `sources.json`. Attribution: `CREDITS.md`. Controls and checks: `README.md`.
- Regression coverage: `tests/sim-tests.js`, `src/scenes/hangar/assemblySelfTest.js`, `src/scenes/hangar/selfTest.js`, `tests/visual.html`, `tests/visual-tests.js`.
- Earlier fixes in the same local changeset: `src/core/input.js`, `src/main.js`, `src/scenes/hangar/player.js`, `src/core/audio.js`, `tests/audio.html`, `tests/audio-tests.js`.

## Practical limits

Automated scene and performance checks run in the connected Chromium browser. The native Firefox visual/FPS result still needs the user's playtest. The audio compatibility fallback is covered by a reproduced Firefox-style API test.

Ground markers follow the teaching scenario's trajectory and window schedule. A geodetic station-to-map alignment and full orbital mechanics remain separate work. Clouds use a separate spherical shell above the displaced terrain.
