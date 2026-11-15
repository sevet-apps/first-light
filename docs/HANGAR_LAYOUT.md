# Hangar layout — the contract between gameplay code and the Blender hangar

Units metres, Y up, origin = centre of the hall floor. North = −Z (towards the rocket), East = +X.
Gameplay code keeps these numbers in **one** module (`src/scenes/hangar/layout.js`); the Blender hangar (T8) must place geometry, `COL_*` collider boxes and `INTERACT_*` / `SOCKET_*` empties at the same coordinates.

## Hall
- Interior: X −30…30, Z −40…40, ceiling 72 m. Concrete floor; walls with a structural steel frame.
- Clerestory windows high on the east and west walls (≈ 45–68 m) — sources of the warm light shafts.
- South wall: giant vertical-lift door (opening X −12…12, height 40 m), closed; a person door next to it.

## Zones and stations

| Id | What | Position (x, z) | Footprint / facing | Notes |
|---|---|---|---|---|
| `spawn` | player start | (0, 32) | facing north (yaw 0) | first view: the whole rocket towering ahead |
| `launcher` | mobile launcher platform | centre (0, −22) | 12 × 12 m, 3 m high | collider; rocket stands on it |
| `rocket` | launch vehicle | base (0, 3, −22) | ~50 m tall, core Ø 3.7 m, 2 boosters at x ±3.2 | upper stage / fairing top at ≈ 53 m |
| `tower` | service tower with access platforms | (−9, −22) | 5 × 5 m footprint | collider; platforms at 12, 24, 36, 48 m are visual |
| `cleanroom` | integration clean room floor | X 8…24, Z −2…18 | white epoxy, yellow/black border, low glass partitions with gaps on the west side | partitions are colliders |
| `stand` | integration stand | (16, 8) | Ø 2.4 m round base, adapter top at y 1.0 | `SOCKET_bus` at (16, 1.0, 8) |
| `rack_bus` | rack: buses | (11, 14) | 3.2 × 1.0 m, facing the stand | 2 parts |
| `rack_instrument` | rack: instruments | (21, 14) | 3.2 × 1.0 m | 2 parts |
| `rack_solar` | rack: solar | (23.5, 6) | 1.0 × 4.2 m (long side N–S) | 3 parts |
| `rack_battery` | rack: batteries | (21, 1) | 3.2 × 1.0 m | 2 parts |
| `rack_antenna` | rack: antennas | (11, 1) | 3.2 × 1.0 m | 3 parts |
| `console` | Mission Console (brief, readiness check, integrate) | (9, 8) | desk 2.4 × 0.9 m, screen facing east | `INTERACT_console` |
| `encap` | encapsulation cell: payload adapter + open fairing halves | (9, −14) | 5 × 5 m | where the satellite goes on "Integrate" |
| `crane` | overhead bridge crane | rail along Z at y 60 | hook travels encap → rocket top | used in the integration cinematic |
| `launch_ctl` | Launch Control desk | (−12, 10) | desk 3 × 1 m, facing the rocket (north-east) | `INTERACT_launch` |

Props for scale and atmosphere (crates, carts, gas bottles, tool chests, cable reels, a forklift, signage) line the walls and the edges of zones; each solid prop larger than 0.5 m gets a `COL_` box.

## Part sockets on a bus (bus local space, origin = bottom centre on the stand adapter)
- `SOCKET_instrument` — top face centre, pointing +Y (on orbit this face points at Earth).
- `SOCKET_antenna` — front face (+Z) centre.
- `SOCKET_solar` — origin for the solar part (body cells wrap the bus; deployable arrays mount on ±X faces, stowed for launch).
- `SOCKET_battery` — rear face (−Z), behind an access panel.

Bus sizes: MB-40 0.6 × 0.8 × 0.6 m (w × h × d), SB-90 1.0 × 1.3 × 1.0 m.
