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
- `SOCKET_solar_px` / `SOCKET_solar_nx` — hinge lines on the ±X faces where the two wings of a deployable array (`wing_px` / `wing_nx`) attach, stowed for launch.
- `SOCKET_body` — origin for body-mounted cells (they wrap the bus faces; the part has a `fit_bus_micro` / `fit_bus_small` variant).
- `SOCKET_battery` — rear face (−Z), behind an access panel.

Bus sizes: MB-40 0.6 × 0.8 × 0.6 m (w × h × d), SB-90 1.0 × 1.3 × 1.0 m.

## Integration cinematic (T3c) — what the Blender models must match
The choreography lives in `src/scenes/hangar/integration.js` (times, paths, camera shots, sound hooks); the numbers it needs are in `layout.js`.
- **Payload adapter ring** (`PAYLOAD.ringR` 0.74 m, 0.1 m tall) stands on the encapsulation pedestal, whose top is `ENCAP.padY` = 1.04 m. Origin of the payload = underside of the ring; the satellite base sits on the ring top.
- **Fairing halves** (`PAYLOAD.radius` 1.2 m, barrel 3.0 m + ogive 1.6 m): each half is open towards the axis and waits `PAYLOAD.openGap` = 1.4 m to the east / west of it, then translates along X to close. Two lifting lugs per half on the barrel top.
- **Rocket top**: the upper stage ends in a 1.25 m radius payload deck at `ROCKET.payloadY` = 48.4 m; the closed fairing tip is at 53.1 m. The rocket has no nose of its own.
- **Overhead crane**: rails along Z at x = ±`CRANE.railX`, y = `CRANE.railY`; the bridge girder (y = `bridgeY`) moves in Z, the trolley (y = `trolleyY`) in X, the hook block hangs on a cable and goes up to `hookMaxY`. Slings reach the lugs (payload) or a lifting ring round the satellite top.
- Colliders `encap_half_w` / `encap_half_e` are removed from the world when the halves leave the cell.
