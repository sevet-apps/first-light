// Placeholder geometry for the integration cinematic: the overhead crane (bridge, trolley, cable, hook block and
// slings) and the payload (adapter ring plus two fairing halves). `apply(sample)` poses it from a choreography
// sample (integration.js). The Blender crane and fairing replace this file; the choreography stays.
import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const HOOK_BLOCK = { w: 0.9, h: 1.2, d: 0.6 };
const SLING_RADIUS = 0.018;
const RING_SLINGS = 0.45; // radius of the satellite's lifting ring
const COLLAR_LUG = 0.88; // fairing lugs sit at (+-LUG, +-LUG) on the barrel top
const TRUCK = { w: 1.6, h: 1.2, d: 2.2 };

const castAll = (object) => {
  object.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return object;
};

const mesh = (geometry, material, [x, y, z] = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
};

/** Profile of a fairing half in metres: cylinder barrel, then a tangent-ogive nose closing on the axis. */
function fairingProfile(P) {
  const points = [new THREE.Vector2(P.radius, 0), new THREE.Vector2(P.radius, P.barrelH)];
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push(new THREE.Vector2(Math.max(0.03, P.radius * (1 - t * t) ** 0.6), P.barrelH + P.noseH * t));
  }
  return points;
}

/** Cylinder from point a to point b (world), updated in place. */
function stretch(strut, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  strut.position.copy(a).addScaledVector(dir, 0.5);
  strut.scale.set(1, length, 1);
  strut.quaternion.setFromUnitVectors(Y_AXIS, dir.divideScalar(length || 1));
}

/**
 * @param {object} layout hangar layout (PAYLOAD, CRANE, ENCAP)
 * @param {object} mat material palette of the placeholder kit
 * @returns {{ group: THREE.Group, payload: THREE.Group, halves: {east: THREE.Object3D, west: THREE.Object3D}, setSatelliteTop(top): void, apply(sample): void }}
 */
export function buildIntegrationRig(layout, mat) {
  const { PAYLOAD: P, CRANE: C } = layout;
  const group = new THREE.Group();
  group.name = 'integration-rig';

  // ---- payload: adapter ring + fairing halves (open sides face the axis)
  const payload = new THREE.Group();
  payload.name = 'payload';
  payload.add(mesh(new THREE.CylinderGeometry(P.ringR, P.ringR, P.ringH, 36), mat.orange, [0, P.ringH / 2, 0]));
  const profile = fairingProfile(P);
  const halves = {};
  for (const [name, side] of [['east', 1], ['west', -1]]) {
    const half = new THREE.Group();
    half.name = `fairing_${name}`;
    half.add(mesh(new THREE.LatheGeometry(profile, 28, side > 0 ? 0 : Math.PI, Math.PI), mat.whiteDouble, [0, P.ringH, 0]));
    half.add(mesh(new THREE.CylinderGeometry(P.radius + 0.02, P.radius + 0.02, 0.14, 28, 1, true, side > 0 ? 0 : Math.PI, Math.PI), mat.darkSteel, [0, P.ringH + P.barrelH - 0.2, 0]));
    for (const sz of [-1, 1]) half.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat.yellow, [side * COLLAR_LUG, P.ringH + P.barrelH - 0.1, sz * COLLAR_LUG]));
    payload.add(half);
    halves[name] = half;
  }
  group.add(castAll(payload));

  // ---- crane: bridge on the rails, trolley on the bridge, cable and hook block
  const bridge = new THREE.Group();
  bridge.add(mesh(new THREE.BoxGeometry(2 * C.railX + 1, 1.6, 1.4), mat.yellow, [0, C.bridgeY, 0]));
  for (const sx of [-1, 1]) bridge.add(mesh(new THREE.BoxGeometry(TRUCK.w, TRUCK.h, TRUCK.d), mat.darkSteel, [sx * C.railX, C.railY + 0.4, 0]));
  const trolley = new THREE.Group();
  trolley.add(mesh(new THREE.BoxGeometry(3, 1.2, 3), mat.yellow, [0, C.trolleyY, 0]));
  bridge.add(trolley);
  group.add(castAll(bridge));

  const cable = castAll(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), mat.darkSteel));
  const hookBlock = castAll(mesh(new THREE.BoxGeometry(HOOK_BLOCK.w, HOOK_BLOCK.h, HOOK_BLOCK.d), mat.yellow));
  const hookTip = castAll(mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.3, 10), mat.black));
  group.add(cable, hookBlock, hookTip);

  // ---- rigging: four slings plus the lifting ring that wraps the satellite
  const slings = Array.from({ length: 4 }, () => castAll(mesh(new THREE.CylinderGeometry(SLING_RADIUS, SLING_RADIUS, 1, 6), mat.black)));
  const ring = castAll(mesh(new THREE.TorusGeometry(RING_SLINGS, 0.03, 8, 28).rotateX(Math.PI / 2), mat.yellow));
  group.add(...slings, ring);

  const hook = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const lugs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  let satelliteTop = 2;

  return {
    group,
    payload,
    halves,

    /** Height of the satellite above its base: where the lifting ring and slings attach. */
    setSatelliteTop(top) {
      satelliteTop = top;
    },

    apply(s) {
      hook.fromArray(s.hook);
      bridge.position.z = hook.z;
      trolley.position.x = hook.x;
      hookBlock.position.set(hook.x, hook.y + HOOK_BLOCK.h / 2, hook.z);
      hookTip.position.set(hook.x, hook.y - 0.15, hook.z);
      const trolleyBottom = C.trolleyY - 0.6;
      const top = hook.y + HOOK_BLOCK.h;
      cable.position.set(hook.x, (trolleyBottom + top) / 2, hook.z);
      cable.scale.set(1, trolleyBottom - top, 1);

      payload.position.fromArray(s.payload);
      halves.east.position.x = P.openGap * (1 - s.fairing);
      halves.west.position.x = -P.openGap * (1 - s.fairing);

      ring.visible = s.cargo === 'satellite';
      slings.forEach((sling, i) => {
        sling.visible = s.cargo !== null;
        if (!sling.visible) return;
        from.copy(hook);
        if (s.cargo === 'satellite') {
          const a = (i * Math.PI) / 2;
          to.set(s.satellite[0] + Math.cos(a) * RING_SLINGS, s.satellite[1] + satelliteTop + 0.05, s.satellite[2] + Math.sin(a) * RING_SLINGS);
        } else {
          const [sx, sz] = lugs[i];
          to.set(s.payload[0] + sx * COLLAR_LUG, s.payload[1] + P.ringH + P.barrelH - 0.02, s.payload[2] + sz * COLLAR_LUG);
        }
        stretch(sling, from, to);
      });
      ring.position.set(s.satellite[0], s.satellite[1] + satelliteTop + 0.05, s.satellite[2]);
    },
  };
}
