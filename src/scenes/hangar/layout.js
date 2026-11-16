// Hangar layout: the single source of truth for every coordinate in the hall (docs/HANGAR_LAYOUT.md).
// Units are metres, Y up, origin = centre of the hall floor, north = -Z. Yaw 0 faces north; yaw grows
// counter-clockwise seen from above (forward = (-sin yaw, -cos yaw)), matching three.js rotation.y.
// The placeholder world and the future Blender hangar both place geometry from these numbers.

const rad = (deg) => (deg * Math.PI) / 180;

/** Yaw (deg) that makes a viewer at (fx, fz) face (tx, tz). */
export function faceYaw(fx, fz, tx, tz) {
  return (Math.atan2(-(tx - fx), -(tz - fz)) * 180) / Math.PI;
}

/** Unit forward vector in XZ for a yaw in degrees. */
export const forward = (yawDeg) => ({ x: -Math.sin(rad(yawDeg)), z: -Math.cos(rad(yawDeg)) });

export const HALL = { minX: -30, maxX: 30, minZ: -40, maxZ: 40, height: 72 };
export const PLAYER = { radius: 0.35, eyeHeight: 1.7 };
export const REACH = { part: 3.0, station: 3.5 };

export const SPAWN = { x: 0, z: 32, yawDeg: 0, pitchDeg: 12 }; // pitched up so the whole rocket is in view

export const LAUNCHER = { x: 0, z: -22, w: 12, d: 12, h: 3 };
export const ROCKET = { x: 0, z: -22, baseY: 3, tipY: 53, coreRadius: 1.85, boosterX: 3.2, payloadY: 48.4 }; // payloadY: deck the payload adapter mates to
export const TOWER = { x: -9, z: -22, w: 5, d: 5, platformsY: [12, 24, 36, 48] };

export const CLEANROOM = { x0: 8, x1: 24, z0: -2, z1: 18 };
export const STAND = { x: 16, z: 8, radius: 1.2, topY: 1.0, socketBus: [16, 1.0, 8] };
// Assembly: invisible hit volume over the stand and the satellite on it, and how far away you can aim at it.
export const ASSEMBLY = { reach: 4.0, target: { w: 2.0, y0: 1.0, h: 2.6 } };
export const CONSOLE = { x: 9, z: 8, w: 0.9, d: 2.4 }; // desk long side along Z, screen faces east
export const ENCAP = { x: 9, z: -14, size: 5, padY: 1.04 }; // padY: top of the pedestal the payload adapter stands on
// The encapsulated payload: adapter ring, two fairing halves (open by `openGap` each side of the axis) and the
// crane's sling height above the adapter. Tip of the closed fairing = payloadY + ringH + barrelH + noseH = 53.1 m.
export const PAYLOAD = { ringR: 0.74, ringH: 0.1, radius: 1.2, barrelH: 3.0, noseH: 1.6, openGap: 1.4, hang: 6.0, satelliteHang: 1.3 };
// Overhead bridge crane: rails along Z at railY, the bridge spans X, the trolley rides the bridge.
export const CRANE = { railX: 26, railY: 60, bridgeY: 61.2, trolleyY: 59.4, hookMaxY: 57.2 };
export const LAUNCH_CTL = { x: -12, z: 10, w: 3, d: 1, yawDeg: faceYaw(-12, 10, ROCKET.x, ROCKET.z) };

export const RACK_TOP = 0.85;

/** Rack-local (u along the rack, v towards the back) to world XZ. */
function toWorld(rack, u, v = 0) {
  const c = Math.cos(rad(rack.yawDeg));
  const s = Math.sin(rad(rack.yawDeg));
  return { x: rack.x + u * c + v * s, z: rack.z - u * s + v * c };
}

// Physical size [w, h, d] of each catalog part in metres (bus sizes from the layout contract).
export const PART_SIZES = {
  obc_1: [0.22, 0.14, 0.24],
  adcs_1: [0.24, 0.28, 0.24],
  bus_micro: [0.6, 0.8, 0.6],
  bus_small: [1.0, 1.3, 1.0],
  inst_wfc: [0.3, 0.45, 0.3],
  inst_hri: [0.45, 0.7, 0.45],
  sol_body: [0.5, 0.12, 0.5],
  sol_2wing: [0.8, 0.22, 0.6],
  sol_4panel: [1.0, 0.3, 0.8],
  bat_120: [0.3, 0.12, 0.2],
  bat_400: [0.42, 0.16, 0.3],
  ant_uhf: [0.12, 0.85, 0.12],
  ant_sband: [0.22, 0.05, 0.22],
  ant_xband: [0.5, 0.45, 0.5],
};

// Racks. w runs along the rack, d is its depth, yawDeg is the direction the front faces.
// Slots give each part's offset u along the rack; world positions are derived below.
const RACK_DEFS = [
  { id: 'rack_systems', label: 'FLIGHT SYSTEMS', category: 'avionics', x: 16, z: 16.8, w: 3.2, d: 1.0, yawDeg: 0, slots: [['obc_1', -0.65], ['adcs_1', 0.65]] },
  { id: 'rack_bus', label: 'BUSES', category: 'bus', x: 11, z: 14, w: 3.2, d: 1.0, yawDeg: 0, slots: [['bus_micro', -0.9], ['bus_small', 0.75]] },
  { id: 'rack_instrument', label: 'INSTRUMENTS', category: 'instrument', x: 21, z: 14, w: 3.2, d: 1.0, yawDeg: 0, slots: [['inst_wfc', -0.7], ['inst_hri', 0.7]] },
  { id: 'rack_solar', label: 'SOLAR ARRAYS', category: 'solar', x: 23.5, z: 6, w: 4.2, d: 1.0, yawDeg: 90, slots: [['sol_body', -1.3], ['sol_2wing', 0], ['sol_4panel', 1.3]] },
  { id: 'rack_battery', label: 'BATTERIES', category: 'battery', x: 21, z: 1, w: 3.2, d: 1.0, yawDeg: 180, slots: [['bat_120', -0.6], ['bat_400', 0.6]] },
  { id: 'rack_antenna', label: 'ANTENNAS', category: 'antenna', x: 11, z: 1, w: 3.2, d: 1.0, yawDeg: 180, slots: [['ant_uhf', -1.0], ['ant_sband', 0], ['ant_xband', 1.0]] },
];

export const RACKS = RACK_DEFS.map((rack) => ({
  ...rack,
  h: RACK_TOP,
  slots: rack.slots.map(([partId, u]) => {
    const p = toWorld(rack, u);
    const size = PART_SIZES[partId];
    return { partId, u, x: p.x, y: RACK_TOP + size[1] / 2, z: p.z, yawDeg: rack.yawDeg, size };
  }),
}));

// Props for scale and atmosphere. Solid ones larger than 0.5 m also become colliders.
export const PROPS = [
  { type: 'crate', x: -27, z: -30, w: 2.0, d: 1.2, h: 1.2, yawDeg: 0 },
  { type: 'crate', x: -27.4, z: -27.6, w: 1.2, d: 1.2, h: 1.2, yawDeg: 10 },
  { type: 'crate', x: -26.8, z: -33.4, w: 1.5, d: 1.5, h: 1.6, yawDeg: -8 },
  { type: 'cart', x: -22, z: -3, w: 0.8, d: 1.8, h: 0.9, yawDeg: 12 },
  { type: 'chest', x: -27.4, z: 14, w: 0.6, d: 1.2, h: 1.1, yawDeg: 0 },
  { type: 'bottles', x: -27.4, z: 20, w: 0.9, d: 0.4, h: 1.5, yawDeg: 0 },
  { type: 'drum', x: -25.5, z: 24, r: 0.3, h: 0.9 },
  { type: 'reel', x: -27, z: 29, w: 0.8, d: 1.4, h: 1.4, yawDeg: 20 },
  { type: 'forklift', x: -24, z: 36, w: 1.3, d: 2.6, h: 2.1, yawDeg: -15 },
  { type: 'crate', x: 27, z: -30, w: 2.0, d: 1.4, h: 1.5, yawDeg: 0 },
  { type: 'pallet', x: 27, z: -12, w: 1.2, d: 1.2, h: 0.9, yawDeg: 4 },
  { type: 'cart', x: 14, z: -9, w: 0.8, d: 1.8, h: 0.9, yawDeg: -8 },
  { type: 'chest', x: 27.4, z: 22, w: 0.6, d: 1.2, h: 1.1, yawDeg: 0 },
  { type: 'bottles', x: 27.4, z: 28, w: 0.9, d: 0.4, h: 1.5, yawDeg: 0 },
  { type: 'crate', x: 26, z: 36, w: 1.8, d: 1.2, h: 1.0, yawDeg: 6 },
  { type: 'cabinet', x: -14, z: -38.6, w: 2.4, d: 0.8, h: 2.0, yawDeg: 0 },
  { type: 'cabinet', x: 16, z: -38.6, w: 2.4, d: 0.8, h: 2.0, yawDeg: 0 },
  { type: 'cart', x: 3.4, z: -12.6, w: 0.8, d: 1.4, h: 0.9, yawDeg: 30 },
];

// Human reference figure next to the launcher: exactly 1.8 m tall.
export const HUMAN = { x: -3, z: -14.6, heightM: 1.8, radius: 0.3 };

export const COLUMN_Z = [-36, -24, -12, 0, 12, 24, 36];
// z ranges of the low glass wall on the clean room's west side; the gaps between are the entrances.
export const PARTITIONS = [[-2, 2], [5, 11], [14, 18]];

/** Colliders in XZ. box: centre x,z, size w (local X) by d (local Z), yaw; circle: centre x,z, radius r.
 *  h = height, used for ray occlusion only (movement is 2D). */
export const COLLIDERS = [
  { id: 'highbay_door', shape: 'box', x: 0, z: 39.5, w: 26, d: 0.7, yawDeg: 0, h: 41.4 },
  { id: 'launcher', shape: 'box', x: LAUNCHER.x, z: LAUNCHER.z, w: LAUNCHER.w, d: LAUNCHER.d, yawDeg: 0, h: LAUNCHER.h },
  { id: 'tower', shape: 'box', x: TOWER.x, z: TOWER.z, w: TOWER.w, d: TOWER.d, yawDeg: 0, h: 52 },
  { id: 'stand', shape: 'circle', x: STAND.x, z: STAND.z, r: STAND.radius, h: STAND.topY },
  { id: 'console', shape: 'box', x: CONSOLE.x, z: CONSOLE.z, w: CONSOLE.w, d: CONSOLE.d, yawDeg: 0, h: 1.0 },
  { id: 'launch_ctl', shape: 'box', x: LAUNCH_CTL.x, z: LAUNCH_CTL.z, w: LAUNCH_CTL.w, d: LAUNCH_CTL.d, yawDeg: LAUNCH_CTL.yawDeg, h: 1.0 },
  { id: 'encap_adapter', shape: 'circle', x: ENCAP.x, z: ENCAP.z, r: 0.7, h: 1.2 },
  { id: 'encap_half_w', shape: 'box', x: ENCAP.x - 2.0, z: ENCAP.z, w: 1.2, d: 2.4, yawDeg: 0, h: 4.5 },
  { id: 'encap_half_e', shape: 'box', x: ENCAP.x + 2.0, z: ENCAP.z, w: 1.2, d: 2.4, yawDeg: 0, h: 4.5 },
  { id: 'human', shape: 'circle', x: HUMAN.x, z: HUMAN.z, r: HUMAN.radius, h: HUMAN.heightM },
  ...RACKS.map((r) => ({ id: r.id, shape: 'box', x: r.x, z: r.z, w: r.w, d: r.d, yawDeg: r.yawDeg, h: r.h })),
  ...PARTITIONS.map(([z0, z1], i) => ({
    id: `glass_${i}`, shape: 'box', x: CLEANROOM.x0, z: (z0 + z1) / 2, w: 0.1, d: z1 - z0, yawDeg: 0, h: 1.1, occludes: false,
  })),
  ...[-1, 1].flatMap((side) => COLUMN_Z.map((z) => ({
    id: `column_${side < 0 ? 'w' : 'e'}${z}`, shape: 'box', x: side * 29.55, z, w: 0.9, d: 0.9, yawDeg: 0, h: HALL.height,
  }))),
  ...PROPS.map((p, i) => ({ p, i })).filter(({ p }) => (p.r ? p.r * 2 : Math.max(p.w, p.d)) > 0.5).map(({ p, i }) => (p.r
    ? { id: `prop_${i}_${p.type}`, shape: 'circle', x: p.x, z: p.z, r: p.r, h: p.h }
    : { id: `prop_${i}_${p.type}`, shape: 'box', x: p.x, z: p.z, w: p.w, d: p.d, yawDeg: p.yawDeg, h: p.h })),
];

/** Floor material under (x, z): drives footstep sounds. */
export function surfaceAt(x, z) {
  const c = CLEANROOM;
  return x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 ? 'epoxy' : 'concrete';
}

const rackStation = (rack, dist) => {
  const f = forward(rack.yawDeg);
  const gap = rack.d / 2 + dist;
  return { kind: 'rack', x: rack.x + f.x * gap, z: rack.z + f.z * gap, yawDeg: rack.yawDeg + 180 };
};

const launchFwd = forward(LAUNCH_CTL.yawDeg);

/** Where the player stands to use each station (yaw faces the station). */
export const STATIONS = {
  ...Object.fromEntries(RACKS.map((r) => [r.id, rackStation(r, 1.3)])),
  stand: { kind: 'stand', x: STAND.x, z: STAND.z + 2.7, yawDeg: 0 },
  console: { kind: 'console', x: CONSOLE.x + 1.9, z: CONSOLE.z, yawDeg: 90 },
  launch_ctl: { kind: 'launch', x: LAUNCH_CTL.x - launchFwd.x * 1.7, z: LAUNCH_CTL.z - launchFwd.z * 1.7, yawDeg: LAUNCH_CTL.yawDeg },
  encap: { kind: 'encap', x: ENCAP.x, z: ENCAP.z + 3.8, yawDeg: 0 },
  launcher: { kind: 'launcher', x: 0, z: -14.8, yawDeg: 0 },
};

export const layout = {
  HALL, PLAYER, REACH, SPAWN, LAUNCHER, ROCKET, TOWER, CLEANROOM, STAND, ASSEMBLY, CONSOLE, ENCAP, PAYLOAD, CRANE, LAUNCH_CTL,
  RACK_TOP, RACKS, PROPS, HUMAN, PART_SIZES, COLLIDERS, STATIONS, PARTITIONS, COLUMN_Z,
  sockets: { bus: STAND.socketBus },
  surfaceAt, faceYaw, forward,
};
