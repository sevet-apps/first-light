// Placeholder satellite parts: simple distinct shapes at real size, standing on a rack.
// Each part is a Group named by its catalog id with its origin at the bottom centre.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  if (fins) {
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(w / 2 + 0.025, w / 2 + 0.025, 0.012, 28), mat.alu, [0, bodyH * (0.25 + i * 0.25), 0]));
  }
  return g;
}

/** Solar array stowed for launch: a stack of panels with a gap for the spacer pads. */
function solarStack(mat, [w, h, d], panels, { strap }) {
  const g = new THREE.Group();
  const pitch = h / panels;
  for (let i = 0; i < panels; i++) {
    const y = pitch * (i + 0.5);
    g.add(box(mat.alu, w, pitch * 0.32, d, [0, y, 0]));
    g.add(box(mat.cell, w - 0.04, pitch * 0.12, d - 0.04, [0, y + pitch * 0.22, 0]));
  }
  for (const sx of [-1, 1]) g.add(box(mat.anodized, 0.03, h, 0.05, [sx * (w / 2 - 0.02), h / 2, 0]));
  if (strap) g.add(box(mat.signalRed, 0.05, h + 0.02, d + 0.02, [0, h / 2, 0]));
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
  antenna.rotation.x = -0.55;
  antenna.add(mesh(bowl, mat.aluDouble, [0, 0, 0]));
  antenna.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8), mat.anodized, [0, 0.12, 0]));
  antenna.add(cyl(mat.foil, 0.03, 0.04, [0, 0.25, 0], 12));
  g.add(antenna);
  return g;
}

const BUILDERS = {
  bus_micro: (mat, s) => bus(mat, s),
  bus_small: (mat, s) => bus(mat, s),
  inst_wfc: (mat, s) => instrument(mat, s, { fins: false }),
  inst_hri: (mat, s) => instrument(mat, s, { fins: true }),
  sol_body: (mat, s) => solarStack(mat, s, 4, { strap: false }),
  sol_2wing: (mat, s) => solarStack(mat, s, 6, { strap: true }),
  sol_4panel: (mat, s) => solarStack(mat, s, 8, { strap: true }),
  bat_120: (mat, s) => battery(mat, s, 1),
  bat_400: (mat, s) => battery(mat, s, 2),
  ant_uhf: (mat, s) => whip(mat, s),
  ant_sband: (mat, s) => patch(mat, s),
  ant_xband: (mat, s) => dish(mat, s),
};

/** Collapse a part's meshes into one mesh per material (keeps draw calls low); the group's origin is kept. */
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

/** Build every rack part from the layout. Returns Map(partId -> Group), already placed in the world. */
export function buildParts(layout, mat) {
  const parts = new Map();
  for (const rack of layout.RACKS) {
    for (const slot of rack.slots) {
      const group = mergeByMaterial(BUILDERS[slot.partId](mat, slot.size));
      group.name = slot.partId;
      group.position.set(slot.x, layout.RACK_TOP, slot.z);
      group.rotation.y = (slot.yawDeg * Math.PI) / 180;
      group.userData.partId = slot.partId;
      parts.set(slot.partId, group);
    }
  }
  return parts;
}
