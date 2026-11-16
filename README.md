# FIRST LIGHT

*Build it. Launch it. Bring home first light.*

A first-person browser 3D game for the **NASA Space Apps Challenge — Space Mission Design Game**. Walk a towering rocket hangar, assemble an Earth-observation satellite with your own hands, launch it, and operate it in orbit until its data reaches the ground.

> Work in progress. See [`docs/DESIGN.md`](docs/DESIGN.md) for the design bible and [`docs/TICKETS.md`](docs/TICKETS.md) for progress.

## Run locally
```bash
python tools/serve.py
```
Then open http://localhost:8080.

## Controls and visual update
Click the game to capture the mouse; **Esc** releases it. **WASD** moves, **Shift** runs, **Space** jumps, **E** interacts and **Q** returns a carried part.

Build seven modules: bus, flight computer, attitude control, instrument, solar array, battery and antenna. In orbit, **1/2/3** select charging, imaging and downlink. Drag to orbit the camera, scroll to zoom, **V** switches between satellite and Earth views, **P** pauses mission time while you explore and **H** hides the instruments.

Verification: [`tests/sim.html`](tests/sim.html), [`tests/hangar.html`](tests/hangar.html), [`tests/assembly.html`](tests/assembly.html), [`tests/audio.html`](tests/audio.html), [`tests/visual.html`](tests/visual.html).

## Credits
See [CREDITS.md](CREDITS.md).
