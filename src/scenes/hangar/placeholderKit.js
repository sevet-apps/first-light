// Tools for the placeholder hangar: a merging geometry builder, the material palette and the small
// procedural textures. Everything art-related lives here and in placeholderWorld.js so the real Blender
// hangar can replace it without touching gameplay code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSatelliteMaterials } from '../shared/satelliteMaterials.js';

const rad = (deg) => (deg * Math.PI) / 180;

/** Collects many primitives and emits one mesh per material, keeping the hall's draw calls low. */
export class StaticBuilder {
  constructor() {
    this.byMaterial = new Map();
    this.stack = [new THREE.Matrix4()];
  }

  /** Make following primitives local to a frame at (x, y, z) rotated by yawDeg about Y. Pair with pop(). */
  push(x = 0, y = 0, z = 0, yawDeg = 0) {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad(yawDeg)),
      new THREE.Vector3(1, 1, 1),
    );
    this.stack.push(this.stack.at(-1).clone().multiply(local));
    return this;
  }

  pop() {
    this.stack.pop();
    return this;
  }

  /** Add `geometry` (consumed) at a position with Euler rotation in degrees [rx, ry, rz]. */
  add(material, geometry, [x, y, z] = [0, 0, 0], rot = null) {
    rot ??= [0, 0, 0];
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(rot[0]), rad(rot[1]), rad(rot[2]))),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(this.stack.at(-1).clone().multiply(local));
    if (!this.byMaterial.has(material)) this.byMaterial.set(material, []);
    this.byMaterial.get(material).push(geometry);
    return this;
  }

  box(material, [w, h, d], pos, rot) {
    return this.add(material, new THREE.BoxGeometry(w, h, d), pos, rot);
  }

  cylinder(material, rTop, rBottom, h, pos, rot, segments = 20) {
    return this.add(material, new THREE.CylinderGeometry(rTop, rBottom, h, segments), pos, rot);
  }

  /** Plane facing +Z (rotate it as needed). `tile` repeats a texture every `tile` metres. */
  plane(material, w, h, pos, rot, tile = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (tile) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
    }
    return this.add(material, g, pos, rot);
  }

  /** Merge into one mesh per material and add them to `parent`. Returns the meshes. */
  build(parent) {
    const meshes = [];
    for (const [material, list] of this.byMaterial) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
      mesh.castShadow = !material.userData.noCast;
      mesh.receiveShadow = !material.userData.noReceive;
      parent.add(mesh);
      meshes.push(mesh);
      list.forEach((g) => g.dispose());
    }
    this.byMaterial.clear();
    return meshes;
  }
}

function canvasTexture(draw, { repeat = true, width = 256, height = width } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** One 6 m concrete slab: mottled grey with expansion joints on two edges. */
const concreteTexture = () => canvasTexture((ctx, w, h) => {
  ctx.fillStyle = '#7d848c';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 5000, 0.12);
  ctx.fillStyle = 'rgba(20,24,30,0.55)';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, 0, 3, h);
}, { width: 512 });

/** Vertical-ribbed wall cladding, 1 m per tile. */
const claddingTexture = () => canvasTexture((ctx, w, h) => {
  ctx.fillStyle = '#4a5d7d';
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += w / 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, 0, 6, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 6, 0, 4, h);
  }
  speckle(ctx, w, h, 900, 0.1);
});

const LABELS = ['BUSES', 'INSTRUMENTS', 'SOLAR ARRAYS', 'BATTERIES', 'ANTENNAS', 'MISSION CONSOLE', 'LAUNCH CONTROL', 'INTEGRATION STAND', 'ENCAPSULATION', 'FLIGHT SYSTEMS'];
const ATLAS = { cols: 2, rows: 5, cellW: 1024, cellH: 256 };

/** Paper-and-ink signs, one cell per label (see signUv). */
function signAtlas() {
  const { cols, rows, cellW, cellH } = ATLAS;
  return canvasTexture((ctx) => {
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, cellW * cols, cellH * rows);
    LABELS.forEach((text, i) => {
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      ctx.fillStyle = '#F1ECE2';
      ctx.beginPath();
      ctx.roundRect(x + 6, y + 6, cellW - 12, cellH - 12, 18);
      ctx.fill();
      ctx.fillStyle = '#D8382C';
      ctx.fillRect(x + 6, y + 6, 14, cellH - 12);
      ctx.fillStyle = '#1B1B1B';
      ctx.font = '600 80px Inter, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 64, y + cellH / 2 + 2, cellW - 100);
    });
  }, { repeat: false, width: cellW * cols, height: cellH * rows });
}

/** UV rectangle [u0, v0, u1, v1] of a label in the sign atlas. */
export function signUv(label) {
  const i = LABELS.indexOf(label);
  const { cols, rows } = ATLAS;
  const u0 = (i % cols) / cols;
  const v1 = 1 - Math.floor(i / cols) / rows;
  return [u0, v1 - 1 / rows, u0 + 1 / cols, v1];
}

/** Dark display with paper-coloured lines of text. */
export function screenTexture(lines) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#D8382C';
    ctx.fillRect(24, 24, 10, h - 48);
    ctx.fillStyle = '#F1ECE2';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? 46 : 30}px Inter, "Segoe UI", sans-serif`;
      ctx.globalAlpha = i === 0 ? 1 : 0.7;
      ctx.fillText(line, 60, 30 + (i === 0 ? 0 : 36 + i * 44), w - 90);
    });
  }, { repeat: false, width: 512, height: 288 });
}

const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const glow = (color, strength) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), fog: false });

/** Shared material palette of the placeholder hangar. */
export function createMaterials() {
  const m = {
    concrete: std(0xffffff, 0.85, 0, { map: concreteTexture() }),
    cladding: std(0xffffff, 0.9, 0, { map: claddingTexture() }),
    epoxy: std(0xc9d1d8, 0.22),
    steel: std(0x6b7683, 0.55, 0.4),
    darkSteel: std(0x39414c, 0.6, 0.35),
    ceiling: std(0x2a3441, 0.95),
    white: std(0xe9ecef, 0.42),
    whiteDouble: std(0xe9ecef, 0.42, 0, { side: THREE.DoubleSide }),
    skin: std(0xc98f6b, 0.8),
    interstage: std(0x30353c, 0.6, 0.3),
    signalRed: std(0xd8382c, 0.5),
    yellow: std(0xe6b800, 0.6),
    black: std(0x14161a, 0.8),
    blueMat: std(0x2e5aac, 0.7),
    glass: std(0x9fc4dd, 0.1, 0, { transparent: true, opacity: 0.22, depthWrite: false }),
    wood: std(0x8c6a45, 0.85),
    red: std(0xb3322a, 0.5, 0.2),
    navy: std(0x1d2a44, 0.8),
    concreteBase: std(0x6d747c, 0.9),
    cabinet: std(0x8b97a5, 0.5, 0.25),
    rubber: std(0x15171a, 0.95),
    bottleBlue: std(0x2e5aac, 0.4, 0.3),
    bottleGreen: std(0x2f8f5b, 0.4, 0.3),
    bottleWhite: std(0xdadde0, 0.4, 0.3),
    ...createSatelliteMaterials(),
    // Emissive
    led: glow(0xffffff, 2.2),
    ledWarm: glow(0xffd9a8, 1.8),
    windowWarm: glow(0xffb46b, 1.5),
    windowCool: glow(0x7b95bd, 1.1),
    exitGreen: glow(0x4be08a, 2),
    screen: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    sign: new THREE.MeshBasicMaterial({ map: signAtlas() }),
  };
  for (const key of ['ceiling', 'cladding', 'concrete', 'led', 'ledWarm', 'windowWarm', 'windowCool', 'glass', 'exitGreen']) m[key].userData.noCast = true;
  for (const key of ['led', 'ledWarm', 'windowWarm', 'windowCool', 'exitGreen', 'screen', 'sign']) m[key].userData.noReceive = true;
  return m;
}
