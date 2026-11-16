// Where parts attach to a bus. Pure data, shared by the placeholder satellite and the future Blender models:
// every bus carries `SOCKET_<name>` empties (see docs/HANGAR_LAYOUT.md) and the assembly code only ever asks
// for a socket by name, so swapping in the real GLBs needs no logic change.
//
// Conventions
// - Positions are metres in bus space (origin = bottom centre on the stand adapter, +Z = front, +Y = up).
// - Every part node has its origin at the centre of its contact (base) plane and +Y pointing away from that
//   plane. A socket frame therefore has +Y pointing out of the bus face the part sits on:
//   top face +Y, rear face (battery) -Z, side faces (solar wings) +-X.
// - `rotation` is Euler XYZ in degrees, `scale` stretches a part to fit the bus (placeholder wings only).
// - A mount's `offset` is the part's pose inside the socket frame (antennas stand upright on the front face).

export const SOCKET_NAMES = ['instrument', 'antenna', 'battery', 'solar_px', 'solar_nx', 'body'];

const busSockets = ([w, h, d], wingScale) => ({
  instrument: { position: [0, h, 0] },
  antenna: { position: [0, h / 2, d / 2] },
  battery: { position: [0, h / 2, -d / 2], rotation: [-90, 0, 0] },
  solar_px: { position: [w / 2, h / 2, 0], rotation: [0, 0, -90], scale: wingScale },
  solar_nx: { position: [-w / 2, h / 2, 0], rotation: [0, 0, 90], scale: wingScale },
  body: { position: [0, 0, 0] },
});

export const BUS_SOCKETS = {
  bus_micro: busSockets([0.6, 0.8, 0.6], [1.25, 0.85, 0.75]),
  bus_small: busSockets([1.0, 1.3, 1.0], [1.9, 1.0, 1.2]),
};

const FRONT_MAST = { position: [0, 0, 0.07] };

/**
 * Which nodes of each part travel to which socket. A node name refers to a child of the part's root
 * (see placeholderParts.js). `variants` maps a bus id to the node used for that bus (body-mounted cells).
 */
export const MOUNTS = {
  bus_micro: [{ node: 'main', socket: 'bus' }],
  bus_small: [{ node: 'main', socket: 'bus' }],
  inst_wfc: [{ node: 'main', socket: 'instrument' }],
  inst_hri: [{ node: 'main', socket: 'instrument' }],
  sol_body: [{ node: 'stack', socket: 'body', variants: { bus_micro: 'fit_bus_micro', bus_small: 'fit_bus_small' }, bolts: false }],
  sol_2wing: [{ node: 'wing_px', socket: 'solar_px' }, { node: 'wing_nx', socket: 'solar_nx' }],
  sol_4panel: [{ node: 'wing_px', socket: 'solar_px' }, { node: 'wing_nx', socket: 'solar_nx' }],
  bat_120: [{ node: 'main', socket: 'battery' }],
  bat_400: [{ node: 'main', socket: 'battery' }],
  ant_uhf: [{ node: 'main', socket: 'antenna', offset: FRONT_MAST }],
  ant_sband: [{ node: 'main', socket: 'antenna', offset: { rotation: [90, 0, 0] } }],
  ant_xband: [{ node: 'main', socket: 'antenna', offset: { position: [0, -0.12, 0.1], rotation: [0, 180, 0] } }],
};
