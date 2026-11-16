// Mode feedback in the world: the imaging beam from the instrument down to the target, and the pulsing dotted
// downlink to the ground station.
import * as THREE from 'three';

const BEAM_COLOR = 0xffc870;
const LINK_COLOR = 0xfff1d6;
const BEAM_SPREAD = 0.045; // base radius of the cone as a share of its length (about 8 m on the ground)
const LINK_DOTS = 36;
const DOT_SPEED = 0.55; // fraction of the link per second

/** Cone from a point (apex at local origin) along +Z for one unit, scaled to the beam length each frame. */
function beamGeometry() {
  const g = new THREE.CylinderGeometry(0.0015, BEAM_SPREAD, 1, 28, 1, true);
  g.translate(0, -0.5, 0);
  g.rotateX(-Math.PI / 2);
  // Bright at the instrument, fading out towards the ground (alpha in the vertex colours).
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) colors.set([1, 1, 1, 1 - 0.9 * pos.getZ(i)], i * 4);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return g;
}

const additive = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, ...extra,
});

/** Thin scanning cone with a sliding ring and a footprint on the ground. Hidden until `show` is called. */
export function createImagingBeam() {
  const group = new THREE.Group();
  group.visible = false;
  const cone = new THREE.Mesh(beamGeometry(), additive(BEAM_COLOR, 0.36, { vertexColors: true }));
  const scan = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), additive(BEAM_COLOR, 0.8));
  const footprint = new THREE.Mesh(new THREE.CircleGeometry(1, 40), additive(BEAM_COLOR, 0.28));
  group.add(cone, scan);
  const ground = new THREE.Group();
  ground.visible = false;
  ground.add(footprint);

  const normal = new THREE.Vector3();
  return {
    objects: [group, ground],
    /** Beam from `from` to `to`; `earthCentre` orients the footprint on the sphere. */
    show(from, to, earthCentre, seconds) {
      const length = from.distanceTo(to);
      group.visible = ground.visible = true;
      group.position.copy(from);
      group.lookAt(to);
      cone.scale.setScalar(length);
      const f = (seconds * 0.7) % 1;
      scan.position.z = length * f;
      scan.scale.setScalar(BEAM_SPREAD * length * f + 0.2);
      scan.material.opacity = 0.9 * (1 - f * 0.6);
      cone.material.opacity = 0.34 + 0.08 * Math.sin(seconds * 6);
      ground.position.copy(to);
      normal.copy(to).sub(earthCentre).normalize();
      ground.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      footprint.scale.setScalar(BEAM_SPREAD * length);
    },
    hide() {
      group.visible = ground.visible = false;
    },
  };
}

/** A string of bright dots flowing from the satellite to the station, with a soft glow at the station end. */
export function createDownlink() {
  const positions = new Float32Array(LINK_DOTS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dots = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: LINK_COLOR, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false, fog: false,
  }));
  dots.frustumCulled = false;
  dots.visible = false;
  const p = new THREE.Vector3();
  return {
    objects: [dots],
    show(from, to, seconds) {
      dots.visible = true;
      for (let i = 0; i < LINK_DOTS; i++) {
        const k = (i / LINK_DOTS + seconds * DOT_SPEED) % 1;
        p.lerpVectors(from, to, k);
        positions.set([p.x, p.y, p.z], i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
      dots.material.size = 4.5 + 1.8 * Math.sin(seconds * 7);
    },
    hide() {
      dots.visible = false;
    },
  };
}
