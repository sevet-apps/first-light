// Carrying: a part held in front-right of the camera on a spring, the weight model (speed and bob follow the mass)
// and the "viewmodel" depth trick that keeps a held part from ever poking into walls or the near plane.
import * as THREE from 'three';
import { Pose } from './satellite.js';

export const LIGHT_KG = 5; // at or below this the load costs nothing
export const HEAVY_KG = 90; // the heaviest part (SB-90 bus)
export const MIN_SPEED = 0.6; // speed multiplier at HEAVY_KG

const HELD_MAX_SIZE = 0.3; // the longest side of a held part is shown at most this long (metres)
const DEPTH_SLICE = 0.04; // the held part is drawn inside this front slice of the depth range
const FOLLOW_STIFFNESS = 190; // position spring: 1/s^2
const FOLLOW_DAMPING = 17; // 1/s
const TURN_RATE = 15; // orientation lag, 1/s

/** 0 (light) .. 1 (heaviest) load factor for a mass in kg. */
export const loadFactor = (kg) => THREE.MathUtils.clamp((kg - LIGHT_KG) / (HEAVY_KG - LIGHT_KG), 0, 1);

/** Player speed multiplier while carrying `kg`: x1.0 up to 5 kg, linearly down to x0.6 at 90 kg. */
export const speedMultiplierFor = (kg) => 1 - (1 - MIN_SPEED) * loadFactor(kg);

/** Copy of `material` whose vertices are squeezed into the nearest slice of the depth buffer. */
function viewmodelMaterial(material) {
  const copy = material.clone();
  copy.userData = { shared: true }; // textures belong to the original; Carry disposes the copy itself
  copy.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n  gl_Position.z = mix(-gl_Position.w, gl_Position.z, ${DEPTH_SLICE.toFixed(3)});`,
    );
  };
  copy.customProgramCacheKey = () => 'viewmodel';
  return copy;
}

export class Carry {
  constructor({ camera, player }) {
    this.camera = camera;
    this.player = player;
    this.part = null;
    this.copies = new Map(); // original material -> viewmodel copy
    this.scale = 1;
    this.centre = new THREE.Vector3(); // bounds centre of the held part in its root space
    this.anchor = new THREE.Vector3(); // where that centre sits in camera space
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, -0.6, 0.04, 'YXZ'));
    this.tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion() };
  }

  /** Start holding `part`: presentation scale, anchor and viewmodel materials. Returns the live target pose. */
  hold(part) {
    this.part = part;
    const size = part.bounds.getSize(new THREE.Vector3());
    this.scale = Math.min(1, HELD_MAX_SIZE / Math.max(size.x, size.y, size.z));
    part.bounds.getCenter(this.centre);
    const radius = (size.length() / 2) * this.scale;
    this.anchor.set(0.15 + 0.4 * radius, -0.17 - 0.2 * radius, -(0.5 + 1.25 * radius));
    this.#swapMaterials(part, true);
    return this.target();
  }

  release() {
    if (!this.part) return;
    this.#swapMaterials(this.part, false);
    this.part = null;
  }

  /** Where the held part's root wants to be right now (world pose), including the walking sway. */
  target(out = new Pose()) {
    const { player, camera } = this;
    const gain = player.bobGain * (1 + 0.8 * player.weight);
    const sag = 0.035 * player.weight;
    const local = this.anchor.clone();
    local.x += Math.sin(player.phase / 2 + 0.7) * 0.02 * gain;
    local.y += Math.cos(player.phase) * 0.016 * gain - sag;
    camera.updateMatrixWorld();
    const t = this.tmp;
    // root world = camera * T(anchor) * spin * S(scale) * T(-centre)
    t.m.copy(camera.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(local.x, local.y, local.z))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(this.spin))
      .multiply(new THREE.Matrix4().makeScale(this.scale, this.scale, this.scale))
      .multiply(new THREE.Matrix4().makeTranslation(-this.centre.x, -this.centre.y, -this.centre.z));
    t.m.decompose(out.position, out.quaternion, out.scale);
    return out;
  }

  /** Continue the spring from the pose the part currently has (end of the pick-up flight). */
  snap(pose) {
    this.pos.copy(pose.position);
    this.quat.copy(pose.quaternion);
    this.vel.set(0, 0, 0);
  }

  /** Spring the part root towards the target: a little lag when turning, a gentle sway when walking. */
  follow(dt) {
    const root = this.part.root;
    const goal = this.target();
    const h = Math.min(dt, 1 / 30);
    this.vel.addScaledVector(goal.position.clone().sub(this.pos), FOLLOW_STIFFNESS * h);
    this.vel.multiplyScalar(Math.exp(-FOLLOW_DAMPING * h));
    this.pos.addScaledVector(this.vel, h);
    this.quat.slerp(goal.quaternion, 1 - Math.exp(-TURN_RATE * h));
    root.position.copy(this.pos);
    root.quaternion.copy(this.quat);
    root.scale.copy(goal.scale);
  }

  dispose() {
    this.release();
    for (const copy of this.copies.values()) copy.dispose();
    this.copies.clear();
  }

  #swapMaterials(part, on) {
    part.root.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline) return;
      if (on) {
        o.userData.heldOriginal = o.material;
        if (!this.copies.has(o.material)) this.copies.set(o.material, viewmodelMaterial(o.material));
        o.material = this.copies.get(o.material);
        o.userData.heldCast = o.castShadow;
        o.castShadow = false;
      } else if (o.userData.heldOriginal) {
        o.material = o.userData.heldOriginal;
        o.castShadow = o.userData.heldCast;
        delete o.userData.heldOriginal;
        delete o.userData.heldCast;
      }
    });
  }
}
