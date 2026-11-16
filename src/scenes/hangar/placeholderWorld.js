// Placeholder hangar built from layout.js: simple meshes, merged per material, lit well enough to judge
// gameplay. Real Blender art (T8/T9) replaces this module; the scene only needs what it returns.
import * as THREE from 'three';
import { StaticBuilder, createMaterials, screenTexture, signUv } from './placeholderKit.js';
import { buildParts } from '../shared/placeholderParts.js';
import { buildIntegrationRig } from './integrationRig.js';

const deg = (r) => (r * 180) / Math.PI;
const FLOOR_TILE_M = 6;
const FOG_COLOR = 0x1b2634;

/**
 * @returns {{ scene: THREE.Scene, parts: Map<string, THREE.Group>, stations: {console: THREE.Group, launch_ctl: THREE.Group}, rig: object }}
 *   Parts are named by catalog id; the station groups are the interactable desks; rig = crane + payload of the
 *   integration cinematic (see integrationRig.js).
 */
export function buildPlaceholderWorld(layout) {
  const scene = new THREE.Scene();
  const mat = createMaterials();
  addAtmosphere(scene, layout);

  const b = new StaticBuilder();
  hall(b, mat, layout);
  floorMarkings(b, mat, layout);
  launchComplex(b, mat, layout);
  cleanRoom(b, mat, layout);
  racks(b, mat, layout);
  encapsulationCell(b, mat, layout);
  props(b, mat, layout);
  deskSigns(b, mat, layout);
  human(b, mat, layout.HUMAN);
  b.build(scene);

  const parts = buildParts(layout, mat);
  parts.forEach((p) => scene.add(p));
  const stations = { console: consoleDesk(mat, layout.CONSOLE), launch_ctl: launchDesk(mat, layout.LAUNCH_CTL) };
  Object.values(stations).forEach((s) => scene.add(s));
  const rig = buildIntegrationRig(layout, mat);
  scene.add(rig.group);
  return { scene, parts, stations, rig };
}

function addAtmosphere(scene, layout) {
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0085);
  scene.add(new THREE.HemisphereLight(0x8aa2c6, 0x3b4a5e, 2.6));

  // Warm key from the high east windows; the shadow frustum is fitted to the hall footprint.
  const key = new THREE.DirectionalLight(0xffb46b, 2.8);
  const target = new THREE.Vector3(0, 0, -6);
  key.position.copy(target).add(new THREE.Vector3(60, 52, 14).normalize().multiplyScalar(100));
  key.target.position.copy(target);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 20, far: 230 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  scene.add(key, key.target);

  const clean = new THREE.PointLight(0xdfeaff, 38, 26, 2);
  clean.position.set(16, 6.5, 8);
  const control = new THREE.PointLight(0xffd8a8, 24, 18, 2);
  control.position.set(-12, 5, 10);
  scene.add(clean, control);
}

// ---------------------------------------------------------------- hall shell

function hall(b, mat, layout) {
  const { HALL: H, COLUMN_Z } = layout;
  const w = H.maxX - H.minX;
  const d = H.maxZ - H.minZ;
  const mid = H.height / 2;

  b.plane(mat.concrete, w, d, [0, 0, 0], [-90, 0, 0], FLOOR_TILE_M);
  b.plane(mat.ceiling, w, d, [0, H.height, 0], [90, 0, 0]);
  b.plane(mat.cladding, w, H.height, [0, mid, H.minZ], [0, 0, 0], 1);
  // The high-bay door occupies a real opening rather than sitting on top of an unbroken wall.
  for (const side of [-1, 1]) b.plane(mat.cladding, 17, H.height, [side * 21.5, mid, H.maxZ], [0,180,0], 1);
  b.plane(mat.cladding, 26, H.height - 41, [0, (H.height + 41) / 2, H.maxZ], [0,180,0], 1);
  b.plane(mat.cladding, d, H.height, [H.minX, mid, 0], [0, 90, 0], 1);
  b.plane(mat.cladding, d, H.height, [H.maxX, mid, 0], [0, -90, 0], 1);

  // Girts and columns give the walls scale; columns match the collider boxes.
  for (const y of [6, 20, 35, 50, 64]) {
    b.box(mat.darkSteel, [w,0.5,0.3], [0,y,H.minZ+0.15]);
    if (y > 41) b.box(mat.darkSteel, [w,0.5,0.3], [0,y,H.maxZ-0.15]);
    else for (const side of [-1,1]) b.box(mat.darkSteel, [17,0.5,0.3], [side*21.5,y,H.maxZ-0.15]);
    for (const x of [H.minX + 0.15, H.maxX - 0.15]) b.box(mat.darkSteel, [0.3, 0.5, d], [x, y, 0]);
  }
  for (const side of [-1, 1]) {
    for (const z of COLUMN_Z) {
      b.box(mat.steel, [0.9, H.height, 0.9], [side * 29.55, mid, z]);
      b.box(mat.darkSteel, [1.1, 0.3, 1.1], [side * 29.55, 0.15, z]);
    }
  }

  // Clerestory: warm panes on the east, cool on the west, with mullions.
  for (const [x, rotY, glass] of [[H.maxX - 0.1, -90, mat.windowWarm], [H.minX + 0.1, 90, mat.windowCool]]) {
    for (let z = -33; z <= 33; z += 6) b.plane(glass, 5.5, 22, [x, 56.5, z], [0, rotY, 0]);
    for (let z = -36; z <= 36; z += 6) b.box(mat.darkSteel, [0.3, 23, 0.3], [x, 56.5, z]);
    for (const y of [45, 68]) b.box(mat.darkSteel, [0.3, 0.4, d], [x, y, 0]);
  }

  roof(b, mat, layout);
  catwalks(b, mat, layout);
  southDoor(b, mat, layout);
}

function roof(b, mat, layout) {
  const { HALL: H } = layout;
  for (let z = -35; z <= 35; z += 10) {
    b.box(mat.steel, [60, 1.4, 0.5], [0, H.height - 1.7, z]);
    b.box(mat.led, [48, 0.12, 0.28], [0, H.height - 2.5, z]);
  }
  for (const x of [-20, 0, 20]) b.box(mat.darkSteel, [0.6, 0.9, 80], [x, H.height - 1, 0]);
  // Overhead bridge crane rails along Z; the bridge, trolley and hook are the moving rig (integrationRig.js).
  for (const x of [-layout.CRANE.railX, layout.CRANE.railX]) b.box(mat.darkSteel, [0.5, 0.8, 76], [x, layout.CRANE.railY, 0]);
}

function catwalks(b, mat, layout) {
  const { HALL: H } = layout;
  const d = H.maxZ - H.minZ - 2;
  for (const side of [-1, 1]) {
    const x = side * 28.8;
    b.box(mat.darkSteel, [2.4, 0.12, d], [x, 20, 0]);
    b.box(mat.steel, [0.05, 0.05, d], [side * 27.6, 21.05, 0]);
    b.box(mat.steel, [0.05, 0.05, d], [side * 27.6, 20.55, 0]);
    for (let z = -d / 2; z <= d / 2; z += 3) b.box(mat.steel, [0.05, 1.05, 0.05], [side * 27.6, 20.55, z]);
    b.box(mat.ledWarm, [0.1, 0.06, d - 2], [side * 27.7, 19.85, 0]);
  }
}

function southDoor(b, mat, layout) {
  const z = layout.HALL.maxZ - 0.4;
  b.box(mat.black, [25.2,40.5,0.16], [0,20.25,z+0.12]);
  for (let i=0;i<20;i++) {
    const y = 1 + i*2;
    b.box(mat.darkSteel,[24.8,1.96,0.18],[0,y,z-0.05]);
    b.box(mat.steel,[24.3,0.035,0.03],[0,y+0.89,z-0.155]);
  }
  for (const x of [-12.75,12.75]) {
    b.box(mat.steel,[0.32,40.5,0.5],[x,20.25,z-0.1]);
    b.box(mat.black,[0.08,40.3,0.12],[x,20.15,z-0.38]);
  }
  b.box(mat.steel,[26,0.6,0.6],[0,40.65,z-0.1]);
  b.box(mat.darkSteel,[26,0.28,0.85],[0,41.09,z-0.1]);
  for (let i=0;i<20;i++) b.box(i%2 ? mat.black:mat.yellow,[1.24,0.45,0.035],[-11.78+i*1.24,0.35,z-0.16]);
  // Person door beside it, with an exit light.
  b.box(mat.steel, [1.3, 2.4, 0.2], [17, 1.2, layout.HALL.maxZ - 0.1]);
  b.box(mat.cabinet, [1.0, 2.1, 0.12], [17, 1.05, layout.HALL.maxZ - 0.2]);
  b.box(mat.exitGreen, [0.5, 0.15, 0.05], [17, 2.7, layout.HALL.maxZ - 0.2]);
}

// ---------------------------------------------------------------- floor

/** Alternating yellow / black blocks along a rectangle outline (a safety border). */
function hazardFrame(b, mat, x0, z0, x1, z1, width) {
  const block = 0.6;
  const y = 0.017;
  const run = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / block));
    const horizontal = Math.abs(bz - az) < 1e-6;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const size = horizontal ? [len / n, 0.01, width] : [width, 0.01, len / n];
      b.box(i % 2 ? mat.black : mat.yellow, size, [x, y, z]);
    }
  };
  run(x0, z0, x1, z0);
  run(x0, z1, x1, z1);
  run(x0, z0, x0, z1);
  run(x1, z0, x1, z1);
}

function floorMarkings(b, mat, layout) {
  const { LAUNCHER: L } = layout;
  hazardFrame(b, mat, L.x - 7.4, L.z - 7.4, L.x + 7.4, L.z + 7.4, 0.35);
}

function cleanRoom(b, mat, layout) {
  const c = layout.CLEANROOM;
  const w = c.x1 - c.x0;
  const d = c.z1 - c.z0;
  b.plane(mat.epoxy, w, d, [(c.x0 + c.x1) / 2, 0.01, (c.z0 + c.z1) / 2], [-90, 0, 0]);
  hazardFrame(b, mat, c.x0 + 0.15, c.z0 + 0.15, c.x1 - 0.15, c.z1 - 0.15, 0.3);

  // Anti-static mats: a disc round the stand and a strip in front of each rack and the console.
  const s = layout.STAND;
  b.add(mat.blueMat, new THREE.CircleGeometry(2.3, 40), [s.x, 0.014, s.z], [-90, 0, 0]);
  for (const rack of layout.RACKS) {
    b.push(rack.x, 0, rack.z, rack.yawDeg);
    b.plane(mat.blueMat, rack.w + 0.4, 1.9, [0, 0.014, -(rack.d / 2 + 1.0)], [-90, 0, 0]);
    b.pop();
  }
  b.plane(mat.blueMat, 1.5, 3, [layout.CONSOLE.x + 1.5, 0.014, layout.CONSOLE.z], [-90, 0, 0]);

  // Integration stand: base, pedestal and the orange payload adapter whose top is at y = 1.0.
  b.push(s.x, 0, s.z);
  b.cylinder(mat.darkSteel, s.radius, s.radius, 0.3, [0, 0.15, 0], null, 40);
  b.cylinder(mat.yellow, s.radius - 0.05, s.radius - 0.05, 0.012, [0, 0.306, 0], null, 40);
  b.cylinder(mat.steel, 0.5, 0.55, 0.55, [0, 0.575, 0], null, 28);
  b.cylinder(mat.orange, 0.58, 0.58, 0.15, [0, s.topY - 0.075, 0], null, 28);
  b.pop();
  signPost(b, mat, 'INTEGRATION STAND', [s.x, 5.9], 0, 2.7, 1.8);

  // Low glass partitions on the west side, with entrances between the segments.
  for (const [z0, z1] of layout.PARTITIONS) {
    const len = z1 - z0;
    b.box(mat.glass, [0.04, 1.0, len], [c.x0, 0.6, (z0 + z1) / 2]);
    b.box(mat.steel, [0.1, 0.06, len], [c.x0, 1.13, (z0 + z1) / 2]);
    b.box(mat.steel, [0.1, 0.06, len], [c.x0, 0.06, (z0 + z1) / 2]);
    for (let z = z0; z <= z1 + 0.01; z += len / Math.max(1, Math.round(len / 2.5))) b.box(mat.steel, [0.1, 1.1, 0.08], [c.x0, 0.6, z]);
  }
  // Light bars over the clean room.
  for (const z of [0, 8, 16]) b.box(mat.led, [14, 0.1, 0.4], [(c.x0 + c.x1) / 2, 7, z]);
}

function racks(b, mat, layout) {
  for (const rack of layout.RACKS) {
    const { w, d } = rack;
    b.push(rack.x, 0, rack.z, rack.yawDeg);
    b.box(mat.cabinet, [w, 0.78, d], [0, 0.39, 0]);
    b.box(mat.darkSteel, [w + 0.04, 0.05, d + 0.04], [0, 0.825, 0]);
    for (let i = 1; i < 4; i++) b.box(mat.black, [0.012, 0.66, 0.012], [-w / 2 + (i * w) / 4, 0.4, -d / 2 - 0.003]);
    b.box(mat.ledWarm, [w - 0.3, 0.012, 0.012], [0, 0.07, -d / 2 - 0.004]);
    b.box(mat.cabinet, [w, 1.9, 0.04], [0, 1.8, d / 2 - 0.02]);
    for (const sx of [-1, 1]) b.box(mat.darkSteel, [0.07, 1.95, 0.07], [sx * (w / 2 - 0.035), 1.825, d / 2 - 0.035]);
    sign(b, mat, rack.label, 2.0, 0.5, [0, 2.45, d / 2 - 0.05], [0, 180, 0]);
    for (const slot of rack.slots) b.box(mat.rubber, [slot.size[0] + 0.08, 0.02, slot.size[2] + 0.08], [slot.u, 0.86, 0]);
    b.pop();
  }
}

// ---------------------------------------------------------------- launch complex

function launchComplex(b, mat, layout) {
  const { LAUNCHER: L, ROCKET: R, TOWER: T } = layout;
  b.push(L.x, 0, L.z);
  b.box(mat.concreteBase, [L.w, L.h, L.d], [0, L.h / 2, 0]);
  b.box(mat.darkSteel, [L.w - 0.4, 0.12, L.d - 0.4], [0, L.h + 0.06, 0]);
  b.box(mat.black, [3.4, 0.05, 3.4], [0, L.h + 0.13, 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box(mat.steel, [0.5, 1.4, 0.5], [sx * 2.6, L.h + 0.8, sz * 2.6]);
  }
  for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    b.box(mat.yellow, [sx ? 0.3 : L.w, 0.2, sz ? 0.3 : L.d], [sx * (L.w / 2 - 0.15), L.h + 0.1, sz * (L.d / 2 - 0.15)]);
  }
  b.pop();

  tower(b, mat, T);
  rocket(b, mat, R, layout);
}

function rocket(b, mat, R, layout) {
  b.push(R.x, 0, R.z);
  const r = R.coreRadius;
  const y0 = R.baseY;
  b.cylinder(mat.interstage, r + 0.25, r + 0.02, 1.2, [0, y0 + 0.6, 0], null, 40); // engine skirt
  const stack = [[y0 + 1.2, 29, mat.white], [29, 31.5, mat.interstage], [31.5, 37, mat.white], [37, 47, mat.white]];
  for (const [ya, yb, m] of stack) b.cylinder(m, r, r, yb - ya, [0, (ya + yb) / 2, 0], null, 40);
  // Narrow open bands leave the tank skin intact and avoid coplanar end caps.
  const band = (material, radius, height, y, x=0, segments=48) =>
    b.add(material,new THREE.CylinderGeometry(radius,radius,height,segments,1,true),[x,y,0]);
  for (let y=6;y<28;y+=4) band(mat.steel,r+0.025,0.045,y);
  band(mat.signalRed,r+0.026,1.2,20.5);
  band(mat.black,r+0.026,4,8);
  // The nose is the payload fairing, which the crane brings later: upper stage tapers to the payload deck.
  const deckR = layout.PAYLOAD.radius + 0.05;
  b.cylinder(mat.white, deckR, r, R.payloadY - 0.05 - 47, [0, (47 + R.payloadY - 0.05) / 2, 0], null, 40);
  b.cylinder(mat.interstage, deckR, deckR, 0.1, [0, R.payloadY - 0.05, 0], null, 40);
  // Strap-on boosters.
  for (const sx of [-1, 1]) {
    const x = sx * R.boosterX;
    b.cylinder(mat.interstage, 1.05, 0.92, 0.9, [x, y0 + 0.45, 0], null, 28);
    b.cylinder(mat.white, 0.9, 0.9, 20, [x, y0 + 10.9, 0], null, 28);
    b.cylinder(mat.white, 0.05, 0.9, 4, [x, y0 + 22.9, 0], null, 28);
    band(mat.signalRed,0.925,0.7,17,x,32);
    const inner = R.boosterX - 0.9;
    for (const y of [8,16]) b.box(mat.steel,[inner-r+0.12,0.18,0.26],[sx*(r+inner)/2,y,0]);
  }
  b.pop();
}

function tower(b, mat, T) {
  const h = 54;
  const bays = 13;
  const bay = h / bays;
  const half = T.w / 2;
  b.push(T.x, 0, T.z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(mat.steel, [0.45, h, 0.45], [sx * (half - 0.22), h / 2, sz * (half - 0.22)]);
  const tilt = deg(Math.atan2(bay, T.w));
  for (let i = 0; i <= bays; i++) {
    const y = i * bay;
    for (const s of [-1, 1]) {
      b.box(mat.darkSteel, [T.w, 0.18, 0.18], [0, y, s * half]);
      b.box(mat.darkSteel, [0.18, 0.18, T.d], [s * half, y, 0]);
    }
    if (i === bays) break;
    const dir = i % 2 ? 1 : -1;
    const len = Math.hypot(bay, T.w);
    for (const s of [-1, 1]) {
      b.box(mat.darkSteel, [len, 0.14, 0.14], [0, y + bay / 2, s * half], [0, 0, dir * tilt]);
      b.box(mat.darkSteel, [0.14, 0.14, len], [s * half, y + bay / 2, 0], [-dir * tilt, 0, 0]);
    }
  }
  // Access platforms with arms reaching to the rocket (the rocket is at local +x).
  for (const y of T.platformsY) {
    b.box(mat.steel, [T.w + 0.4, 0.2, T.d + 0.4], [0, y, 0]);
    b.box(mat.steel, [4.4, 0.2, 1.8], [T.w / 2 + 2.2 - 0.2, y, 0]);
    for (const sz of [-1, 1]) b.box(mat.yellow, [4.4, 0.06, 0.06], [T.w / 2 + 2, y + 1.05, sz * 0.9]);
    b.box(mat.led, [T.w, 0.06, 0.06], [0, y - 0.15, half + 0.2]);
  }
  b.pop();
}

// ---------------------------------------------------------------- encapsulation cell

function encapsulationCell(b, mat, layout) {
  const { ENCAP: E } = layout;
  b.push(E.x, 0, E.z);
  b.box(mat.darkSteel, [E.size, 0.04, E.size], [0, 0.02, 0]);
  // Pedestal for the payload adapter (the adapter and the fairing halves are the moving rig); halves wait on cradles.
  b.cylinder(mat.alu, 0.7, 0.7, E.padY, [0, E.padY / 2, 0], null, 32);
  b.cylinder(mat.darkSteel, 0.85, 0.85, 0.08, [0, 0.08, 0], null, 32);
  for (const side of [-1, 1]) b.box(mat.darkSteel, [1.5, 0.3, 2.6], [side * 2.0, 0.15, 0]);
  b.pop();
  signPost(b, mat, 'ENCAPSULATION', [E.x, E.z - 2.3], 0, 2.4, 1.8);
}

// ---------------------------------------------------------------- signs

function sign(b, mat, label, w, h, pos, rot) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = signUv(label);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  b.add(mat.sign, g, pos, rot);
}

/** A sign on a thin mast, facing +Z rotated by yawDeg. */
function signPost(b, mat, label, [x, z], yawDeg, y, w) {
  b.push(x, 0, z, yawDeg);
  const panelHeight = w * 0.25 + 0.1;
  const mastHeight = y - panelHeight / 2;
  b.cylinder(mat.darkSteel, 0.035, 0.035, mastHeight, [0, mastHeight / 2, -0.09]);
  b.box(mat.darkSteel, [0.1,0.16,0.1], [0,mastHeight+0.04,-0.07]);
  b.box(mat.darkSteel, [0.42, 0.035, 0.34], [0, 0.0175, -0.09]);
  b.box(mat.black, [w + 0.1, w * 0.25 + 0.1, 0.04], [0, y, -0.03]);
  sign(b, mat, label, w, w * 0.25, [0, y, 0], [0, 0, 0]);
  b.pop();
}

// ---------------------------------------------------------------- props

function props(b, mat, layout) {
  const shapes = {
    crate: (p) => {
      b.box(mat.wood, [p.w, p.h, p.d], [0, p.h / 2, 0]);
      for (const y of [0.15, p.h - 0.15]) b.box(mat.darkSteel, [p.w + 0.02, 0.08, p.d + 0.02], [0, y, 0]);
    },
    pallet: (p) => {
      b.box(mat.wood, [p.w, 0.15, p.d], [0, 0.075, 0]);
      for (const layer of [0, 1]) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(mat.cardboard, [p.w * 0.46, 0.28, p.d * 0.46], [sx * p.w * 0.24, 0.29 + layer * 0.28, sz * p.d * 0.24]);
      }
    },
    cart: (p) => {
      b.box(mat.steel, [p.w, 0.05, p.d], [0, 0.4, 0]);
      b.box(mat.steel, [p.w, 0.04, p.d], [0, 0.15, 0]);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const top = sz > 0 ? 0.9 : 0.65;
          b.box(mat.steel, [0.04,top-0.13,0.04], [sx * (p.w / 2 - 0.03), (top+0.13)/2, sz * (p.d / 2 - 0.03)]);
          b.cylinder(mat.rubber, 0.09, 0.09, 0.05, [sx * (p.w / 2 - 0.03), 0.09, sz * (p.d / 2 - 0.1)], [0, 0, 90], 12);
        }
      }
      b.box(mat.yellow, [p.w, 0.05, 0.05], [0, 0.9, p.d / 2 - 0.03]);
      b.box(mat.cardboard, [p.w * 0.8, 0.3, p.d * 0.4], [0, 0.575, -p.d * 0.15]);
    },
    chest: (p) => {
      b.box(mat.red, [p.w, p.h, p.d], [0, p.h / 2, 0]);
      b.box(mat.darkSteel, [p.w + 0.02, 0.05, p.d + 0.02], [0, p.h, 0]);
      for (let i = 0; i < 4; i++) b.box(mat.black, [0.02, 0.012, p.d * 0.6], [p.w / 2 + 0.01, 0.2 + i * 0.22, 0]);
    },
    bottles: (p) => {
      [mat.bottleBlue, mat.bottleGreen, mat.bottleWhite].forEach((m, i) => {
        b.cylinder(m, 0.115, 0.115, 1.35, [(i - 1) * 0.3, 0.675, 0]);
        b.cylinder(m, 0.05, 0.115, 0.15, [(i - 1) * 0.3, 1.425, 0]);
      });
      b.box(mat.steel, [0.9, 0.03, 0.03], [0, 1.0, 0]);
    },
    drum: (p) => {
      b.cylinder(mat.bottleBlue, p.r, p.r, p.h, [0, p.h / 2, 0], null, 24);
      for (const y of [0.25, 0.65]) b.cylinder(mat.darkSteel, p.r + 0.006, p.r + 0.006, 0.05, [0, y, 0], null, 24);
    },
    reel: (p) => {
      for (const sx of [-1, 1]) b.cylinder(mat.wood, 0.7, 0.7, 0.06, [sx * 0.37, 0.7, 0], [0, 0, 90], 28);
      b.cylinder(mat.black, 0.5, 0.5, 0.68, [0, 0.7, 0], [0, 0, 90], 28);
      b.cylinder(mat.wood, 0.12, 0.12, 0.8, [0, 0.7, 0], [0, 0, 90], 12);
    },
    cabinet: (p) => {
      b.box(mat.cabinet, [p.w, p.h, p.d], [0, p.h / 2, 0]);
      for (let i = 1; i < 3; i++) b.box(mat.black, [0.012, p.h - 0.1, 0.012], [-p.w / 2 + (i * p.w) / 3, p.h / 2, p.d / 2 + 0.003]);
      b.box(mat.ledWarm, [0.3, 0.02, 0.01], [p.w * 0.3, p.h * 0.8, p.d / 2 + 0.005]);
    },
    forklift: (p) => {
      b.box(mat.yellow, [1.1, 0.55, 1.6], [0, 0.65, 0.35]);
      b.box(mat.darkSteel, [1.1, 0.7, 0.55], [0, 0.75, 1.05]);
      for (const sx of [-1, 1]) {
        b.box(mat.darkSteel, [0.06, 1.0, 0.06], [sx * 0.5, 1.55, 0.05]);
        b.box(mat.darkSteel, [0.06, 1.0, 0.06], [sx * 0.5, 1.55, 0.95]);
        b.box(mat.steel, [0.1, 1.9, 0.1], [sx * 0.3, 1.0, -0.95]);
        b.box(mat.steel, [0.1, 0.05, 1.0], [sx * 0.3, 0.1, -1.4]);
        for (const z of [-0.2, 0.9]) b.cylinder(mat.rubber, 0.3, 0.3, 0.2, [sx * 0.62, 0.3, z], [0, 0, 90], 16);
      }
      b.box(mat.darkSteel, [1.1, 0.06, 1.1], [0, 2.1, 0.5]);
      b.box(mat.cabinet, [0.6, 0.4, 0.5], [0, 1.0, 0.4]);
    },
  };
  for (const p of layout.PROPS) {
    b.push(p.x, 0, p.z, p.yawDeg ?? 0);
    shapes[p.type](p);
    b.pop();
  }
}

function deskSigns(b, mat, { CONSOLE: c, LAUNCH_CTL: l }) {
  signPost(b, mat, 'MISSION CONSOLE', [c.x - 0.7, c.z], 90, 2.3, 1.6);
  const behind = { x: l.x + Math.sin((l.yawDeg * Math.PI) / 180) * -0.9, z: l.z + Math.cos((l.yawDeg * Math.PI) / 180) * -0.9 };
  signPost(b, mat, 'LAUNCH CONTROL', [behind.x, behind.z], l.yawDeg, 2.5, 1.8);
}

/** A 1.8 m reference figure: hi-vis vest, white hard hat. */
function human(b, mat, { x, z, heightM }) {
  b.push(x, 0, z);
  for (const s of [-1, 1]) {
    b.box(mat.navy, [0.14, 0.85, 0.16], [s * 0.1, 0.425, 0]);
    b.box(mat.orange, [0.1, 0.55, 0.12], [s * 0.26, 1.18, 0]);
    b.box(mat.skin, [0.09, 0.09, 0.09], [s * 0.26, 0.86, 0]);
  }
  b.box(mat.orange, [0.4, 0.6, 0.22], [0, 1.15, 0]);
  b.box(mat.skin, [0.1, 0.08, 0.1], [0, 1.49, 0]);
  b.add(mat.skin, new THREE.SphereGeometry(0.1, 16, 12), [0, 1.63, 0]);
  const hat = heightM - 1.68; // the hard hat tops the figure out at exactly heightM
  b.add(mat.white, new THREE.SphereGeometry(hat, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.68, 0]);
  b.cylinder(mat.white, hat + 0.04, hat + 0.04, 0.02, [0, 1.67, 0], null, 16);
  b.pop();
}

// ---------------------------------------------------------------- interactable desks

function screenMaterial(lines) {
  return new THREE.MeshBasicMaterial({ map: screenTexture(lines) });
}

const mesh = (geometry, material, [x, y, z], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true;
  return m;
};

/** Mission console: desk with a screen facing east (+X). Origin on the floor at the desk centre. */
function consoleDesk(mat, c) {
  const g = new THREE.Group();
  g.name = 'console';
  g.position.set(c.x, 0, c.z);
  g.add(mesh(new THREE.BoxGeometry(c.w, 0.75, c.d), mat.cabinet, [0, 0.375, 0]));
  g.add(mesh(new THREE.BoxGeometry(c.w + 0.1, 0.04, c.d + 0.1), mat.darkSteel, [0, 0.77, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.02, 0.8), mat.black, [0.18, 0.8, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.35, 0.1), mat.darkSteel, [-0.2, 0.97, 0]));
  const monitor = new THREE.Group();
  monitor.position.set(-0.2, 1.3, 0);
  monitor.rotation.z = 0.12;
  monitor.add(mesh(new THREE.BoxGeometry(0.05, 0.62, 1.08), mat.black, [0, 0, 0]));
  const face = mesh(new THREE.PlaneGeometry(1.0, 0.56), screenMaterial(['MISSION CONSOLE', 'LUMEN-1 · FIRST LIGHT', 'Brief · Readiness · Integrate']), [0.0265, 0, 0], [0, Math.PI / 2, 0]);
  face.castShadow = false;
  monitor.add(face);
  g.add(monitor);
  g.add(mesh(new THREE.SphereGeometry(0.025, 10, 8), mat.signalRed, [0.1, 0.82, 0.9]));
  return g;
}

/** Launch control desk: three screens and a guarded red button facing the operator (local +Z). */
function launchDesk(mat, l) {
  const g = new THREE.Group();
  g.name = 'launch_ctl';
  g.position.set(l.x, 0, l.z);
  g.rotation.y = (l.yawDeg * Math.PI) / 180;
  g.add(mesh(new THREE.BoxGeometry(l.w, 0.75, l.d), mat.cabinet, [0, 0.375, 0]));
  g.add(mesh(new THREE.BoxGeometry(l.w + 0.1, 0.05, l.d + 0.1), mat.darkSteel, [0, 0.775, 0]));
  const texts = [['LAUNCH CONTROL', 'Vehicle on pad', 'Range: clear'], ['COUNTDOWN', 'T-- : -- : --', 'Standby'], ['PAD CAMERA', 'LUMEN-1', 'Fairing closed']];
  texts.forEach((lines, i) => {
    const x = (i - 1) * 0.98;
    g.add(mesh(new THREE.BoxGeometry(0.92, 0.55, 0.05), mat.black, [x, 1.2, -0.2], [-0.1, 0, 0]));
    const face = mesh(new THREE.PlaneGeometry(0.86, 0.48), screenMaterial(lines), [x, 1.2, -0.2 + 0.0265], [-0.1, 0, 0]);
    face.castShadow = false;
    g.add(face);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), mat.darkSteel, [x, 0.97, -0.25]));
  });
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 20), mat.yellow, [0.9, 0.825, 0.2]));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20), mat.signalRed, [0.9, 0.865, 0.2]));
  return g;
}
