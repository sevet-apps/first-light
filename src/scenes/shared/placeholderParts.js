// Placeholder satellite parts: simple distinct shapes at real size, standing on a rack.
// A part is a root Group named by its catalog id (origin = bottom centre, at its rack slot) whose children are
// the nodes that travel to bus sockets on install (see data/sockets.js MOUNTS). Most parts have one node, `main`;
// deployable arrays split into `wing_px` / `wing_nx`; body cells have a rack `stack` and one fitted variant per bus.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUS_SOCKETS, SOCKET_NAMES } from '../../data/sockets.js';
import { detailModel } from './detailModels.js';

const mesh = (geometry, material, [x, y, z], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const box = (m, w, h, d, pos) => mesh(new THREE.BoxGeometry(w, h, d), m, pos);
const cyl = (m, r, h, pos, seg = 24) => mesh(new THREE.CylinderGeometry(r, r, h, seg), m, pos);

/** Bus: foil-wrapped body with aluminium corner rails, top plate and a dark avionics panel on the front (-Z). */
function bus(mat, [w, h, d]) {
  const g = new THREE.Group();
  g.add(box(mat.foil, w - 0.04, h - 0.04, d - 0.04, [0, h / 2, 0]));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.add(box(mat.alu, 0.04, h, 0.04, [sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)]));
  }
  g.add(box(mat.alu, w, 0.03, d, [0, h - 0.015, 0]));
  g.add(box(mat.alu, w, 0.03, d, [0, 0.015, 0]));
  g.add(box(mat.anodized, w * 0.5, h * 0.3, 0.012, [0, h * 0.55, -d / 2 + 0.016]));
  // Frame rails, captive fasteners and harness channels remain visible from close range.
  for (const sy of [0.04,h-0.04]) {
    for (const sz of [-1,1]) g.add(box(mat.alu,w,0.035,0.03,[0,sy,sz*(d/2-0.02)]));
    for (const sx of [-1,1]) g.add(box(mat.alu,0.03,0.035,d,[sx*(w/2-0.02),sy,0]));
  }
  for (const sx of [-1,1]) for (const sy of [0.12,h-0.12]) {
    g.add(mesh(new THREE.CylinderGeometry(0.018,0.018,0.012,6),mat.anodized,
      [sx*(w/2-0.04),sy,d/2+0.006],[Math.PI/2,0,0]));
  }
  for (const sx of [-1,1]) g.add(box(mat.anodized,0.025,h*0.65,0.018,[sx*w*0.3,h*0.52,d/2+0.012]));
  return g;
}

/** Instrument: upright cylinder with a lens barrel on top (the face that looks at Earth). */
function instrument(mat, [w, h], { fins }) {
  const g = new THREE.Group();
  const bodyH = h * 0.7;
  g.add(mesh(new THREE.CylinderGeometry(w / 2, w / 2, bodyH, 28), mat.anodized, [0, bodyH / 2, 0]));
  g.add(mesh(new THREE.CylinderGeometry(w / 2 + 0.01, w / 2 + 0.01, 0.025, 28), mat.alu, [0, 0.0125, 0]));
  const barrelH = h - bodyH;
  g.add(mesh(new THREE.CylinderGeometry(w * 0.38, w * 0.42, barrelH, 28), mat.alu, [0, bodyH + barrelH / 2, 0]));
  g.add(mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.012, 28), mat.lens, [0, h + 0.002, 0]));
  g.add(mesh(new THREE.TorusGeometry(w*0.31,0.008,8,32),mat.anodized,[0,h+0.009,0],[Math.PI/2,0,0]));
  if (fins) {
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(w / 2 + 0.025, w / 2 + 0.025, 0.012, 28), mat.alu, [0, bodyH * (0.25 + i * 0.25), 0]));
  }
  return g;
}

/** Body-mounted cells as shipped: a flat stack of cell panels. */
function solarStack(mat, [w, h, d], panels) {
  const g = new THREE.Group();
  const pitch = h / panels;
  for (let i = 0; i < panels; i++) {
    const y = pitch * (i + 0.5);
    g.add(box(mat.alu, w, pitch * 0.32, d, [0, y, 0]));
    g.add(box(mat.cell, w - 0.04, pitch * 0.12, d - 0.04, [0, y + pitch * 0.22, 0]));
  }
  for (const sx of [-1, 1]) g.add(box(mat.anodized, 0.03, h, 0.05, [sx * (w / 2 - 0.02), h / 2, 0]));
  return g;
}

/** Battery pack: a dark block with a label strip and an orange terminal bar. */
function battery(mat, [w, h, d], cells) {
  const g = new THREE.Group();
  const ch = h / cells;
  for (let i = 0; i < cells; i++) g.add(box(mat.battery, w, ch - 0.004, d, [0, ch * (i + 0.5), 0]));
  g.add(box(mat.cardboard, w * 0.6, 0.003, d * 0.5, [0, h + 0.0015, 0]));
  g.add(box(mat.orange, w * 0.2, 0.012, d * 0.18, [w * 0.32, h + 0.006, -d * 0.28]));
  return g;
}

function whip(mat, [w, h]) {
  const g = new THREE.Group();
  g.add(box(mat.alu, w, 0.06, w, [0, 0.03, 0]));
  g.add(cyl(mat.anodized, 0.025, 0.05, [0, 0.085, 0]));
  g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, h - 0.11, 8), mat.alu, [0, 0.11 + (h - 0.11) / 2, 0]));
  return g;
}

function patch(mat, [w, h, d]) {
  const g = new THREE.Group();
  g.add(box(mat.alu, w, h * 0.5, d, [0, h * 0.25, 0]));
  g.add(box(mat.foil, w * 0.72, h * 0.5, d * 0.72, [0, h * 0.75, 0]));
  return g;
}

function dish(mat, [w]) {
  const g = new THREE.Group();
  g.add(box(mat.alu, 0.2, 0.05, 0.2, [0, 0.025, 0]));
  g.add(cyl(mat.anodized, 0.03, 0.2, [0, 0.15, 0]));
  const r = w / 2;
  const sphereR = r * 1.45;
  const cap = Math.asin(r / sphereR);
  const bowl = new THREE.SphereGeometry(sphereR, 32, 12, 0, Math.PI * 2, Math.PI - cap, cap).translate(0, sphereR, 0);
  const antenna = new THREE.Group(); // pivots on the mast, tilted towards the viewer (-Z)
  antenna.position.set(0, 0.25, 0);
  antenna.rotation.x = 0;
  antenna.add(mesh(bowl, mat.aluDouble, [0, 0, 0]));
  antenna.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8), mat.anodized, [0, 0.12, 0]));
  antenna.add(cyl(mat.foil, 0.03, 0.04, [0, 0.25, 0], 12));
  const rimY = sphereR * (1 - Math.cos(cap));
  antenna.add(mesh(new THREE.TorusGeometry(r, 0.006, 6, 40), mat.anodized, [0, rimY, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const a = new THREE.Vector3(Math.cos(angle) * r * 0.9, rimY, Math.sin(angle) * r * 0.9);
    const end = new THREE.Vector3(0, 0.23, 0);
    const support = cyl(mat.anodized, 0.004, a.distanceTo(end), a.clone().add(end).multiplyScalar(0.5).toArray(), 6);
    support.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(a).normalize());
    antenna.add(support);
  }
  g.add(antenna);
  return g;
}

/** One stowed wing of a deployable array, in node space: contact plane at y = 0, panels stacked along +Y.
 *  X is the wing's length along the bus face, Z its width; installed it stands against a side face. */
function wing(mat, [w, h, d], panels) {
  const g = new THREE.Group();
  const pitch = h / panels;
  for (let i = 0; i < panels; i++) {
    const y = pitch * (i + 0.5);
    g.add(box(mat.alu, w, pitch * 0.5, d, [0, y, 0]));
    g.add(box(mat.cell, w - 0.04, pitch * 0.18, d - 0.04, [0, y + pitch * 0.3, 0]));
  }
  g.add(box(mat.anodized, w, 0.03, 0.05, [0, h * 0.5, d / 2 - 0.025]));
  g.add(box(mat.anodized, w, 0.03, 0.05, [0, h * 0.5, -d / 2 + 0.025]));
  return g;
}

/** Body-mounted cells fitted to one bus: a blue plate on each of the four side faces, in bus space. */
function fittedCells(mat, [w, h, d]) {
  const g = new THREE.Group();
  const plate = (sx, sz, pos) => {
    g.add(box(mat.alu, sx + 0.016, h * 0.86 + 0.016, sz + 0.016, pos));
    g.add(box(mat.cell, sx + 0.024, h * 0.86, sz + 0.024, pos));
  };
  const ex = 0.008;
  plate(0.008, d * 0.86, [w / 2 + ex, h / 2, 0]);
  plate(0.008, d * 0.86, [-w / 2 - ex, h / 2, 0]);
  plate(w * 0.86, 0.008, [0, h / 2, d / 2 + ex]);
  plate(w * 0.86, 0.008, [0, h / 2, -d / 2 - ex]);
  return g;
}

/** SOCKET_* empties on a bus node, from data. The real models carry the same names. */
function addSockets(node, busId) {
  for (const name of SOCKET_NAMES) {
    const def = BUS_SOCKETS[busId][name];
    const socket = new THREE.Object3D();
    socket.name = `SOCKET_${name}`;
    socket.position.set(...def.position);
    socket.rotation.set(...(def.rotation ?? [0, 0, 0]).map((a) => (a * Math.PI) / 180));
    if (def.scale) socket.scale.set(...def.scale);
    node.add(socket);
  }
}

// Nodes of every part: { name: { build(mat, size), at: [x, y, z] rack-form position inside the root, hidden? } }.
const WING = [0.4, 0.22, 0.6];
const WING4 = [0.5, 0.3, 0.8];
const wingNodes = (size, panels) => ({
  wing_px: { build: (mat) => wing(mat, size, panels), at: [size[0] / 2 + 0.01, 0, 0] },
  wing_nx: { build: (mat) => wing(mat, size, panels), at: [-size[0] / 2 - 0.01, 0, 0] },
});
const single = (build) => ({ main: { build, at: [0, 0, 0] } });

const NODES = {
  obc_1: single(() => detailModel('obc_1', true)),
  adcs_1: single(() => detailModel('adcs_1', true)),
  bus_micro: single((mat, s) => bus(mat, s)),
  bus_small: single((mat, s) => bus(mat, s)),
  inst_wfc: single((mat, s) => instrument(mat, s, { fins: false })),
  inst_hri: single((mat, s) => instrument(mat, s, { fins: true })),
  sol_body: {
    stack: { build: (mat, s) => solarStack(mat, s, 4), at: [0, 0, 0] },
    fit_bus_micro: { build: (mat, s, sizes) => fittedCells(mat, sizes.bus_micro), at: [0, 0, 0], hidden: true },
    fit_bus_small: { build: (mat, s, sizes) => fittedCells(mat, sizes.bus_small), at: [0, 0, 0], hidden: true },
  },
  sol_2wing: wingNodes(WING, 3),
  sol_4panel: wingNodes(WING4, 2),
  bat_120: single((mat, s) => battery(mat, s, 1)),
  bat_400: single((mat, s) => battery(mat, s, 2)),
  ant_uhf: single((mat, s) => whip(mat, s)),
  ant_sband: single((mat, s) => patch(mat, s)),
  ant_xband: single((mat, s) => dish(mat, s)),
};

/** Collapse a node's meshes into one mesh per material (keeps draw calls low); the node's origin is kept. */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    o.geometry.dispose();
  });
  const merged = new THREE.Group();
  for (const [material, list] of byMaterial) {
    const m = new THREE.Mesh(mergeGeometries(list, false), material);
    m.castShadow = m.receiveShadow = true;
    merged.add(m);
    list.forEach((g) => g.dispose());
  }
  return merged;
}

/** Unfolded solar array per catalog part: panels in a row per wing, each `length` along the wing and `width` across it. */
const DEPLOYED = {
  sol_2wing: { panels: 1, length: 1.5, width: 1.2 },
  sol_4panel: { panels: 2, length: 1.3, width: 1.5 },
};
const BOOM_LENGTH = 0.35;
const PANEL_GAP = 0.06;

/**
 * One wing of a deployed array, pointing along +X from its pivot: a boom, then flat panels (blue cells on both
 * faces, thin grid lines). The panel plane is XZ, so rotating the pivot about X turns the cells towards the Sun.
 * Returns null for parts without deployable wings.
 */
export function buildDeployedWing(mat, partId) {
  const spec = DEPLOYED[partId];
  if (!spec) return null;
  const g = new THREE.Group();
  const { panels, length, width } = spec;
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, BOOM_LENGTH + 0.02, 10), mat.anodized, [BOOM_LENGTH / 2, 0, 0], [0, 0, Math.PI / 2]));
  for (let i = 0; i < panels; i++) {
    const x = BOOM_LENGTH + length / 2 + i * (length + PANEL_GAP);
    g.add(box(mat.alu, length, 0.03, width, [x, 0, 0]));
    for (const side of [-1, 1]) {
      g.add(box(mat.cell, length - 0.08, 0.008, width - 0.08, [x, side * 0.0165, 0]));
      for (let k = 1; k < 5; k++) g.add(box(mat.cellGrid, 0.012, 0.0095, width - 0.08, [x - length / 2 + 0.04 + ((length - 0.08) * k) / 5, side * 0.0165, 0]));
    }
  }
  return mergeByMaterial(g);
}

/** Build the rack parts from the layout (all of them, or only `partIds`). Returns Map(partId -> root Group), placed on its rack slot. */
export function buildParts(layout, mat, partIds = null) {
  const parts = new Map();
  for (const rack of layout.RACKS) {
    for (const slot of rack.slots) {
      if (partIds && !partIds.includes(slot.partId)) continue;
      const root = new THREE.Group();
      root.name = slot.partId;
      root.userData.partId = slot.partId;
      root.userData.nodes = {};
      for (const [name, def] of Object.entries(NODES[slot.partId])) {
        const node = mergeByMaterial(def.build(mat, slot.size, layout.PART_SIZES));
        node.name = name;
        node.position.set(...def.at);
        node.visible = !def.hidden;
        root.add(node);
        root.userData.nodes[name] = node;
        if (BUS_SOCKETS[slot.partId]) addSockets(node, slot.partId);
      }
      root.position.set(slot.x, layout.RACK_TOP, slot.z);
      root.rotation.y = (slot.yawDeg * Math.PI) / 180;
      parts.set(slot.partId, root);
    }
  }
  return parts;
}
