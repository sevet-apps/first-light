import * as THREE from 'three';
import { surfaceAt } from './layout.js';

export const WALK_SPEED = 3.2;
export const RUN_SPEED = 6.5;
const ACCEL_RATE = 12; // 1/s, exponential approach to the target velocity
const DECEL_RATE = 14;
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const BASE_FOV = 70;
const RUN_FOV_KICK = 4;
const TWO_PI = Math.PI * 2;

// Head bob: one cycle of the phase = one footstep, the camera is lowest when a foot lands.
const BOB = {
  walk: { stride: 1.55, lift: 0.028, sway: 0.014, roll: 0.0035 },
  run: { stride: 2.1, lift: 0.055, sway: 0.026, roll: 0.0065 },
};
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

/** First-person controller: smoothed walking and running over a Collision world, look with a pitch clamp,
 *  head bob, a small FOV kick when running and footstep events. */
export class Player {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./collision.js').Collision} collision
   * @param {{eyeHeight:number}} dims
   * @param {{input?:object, settings?:object}} deps  input: core Input; settings: persisted settings (cameraBob)
   */
  constructor(camera, collision, dims, { input = null, settings = {} } = {}) {
    this.camera = camera;
    this.collision = collision;
    this.eyeHeight = dims.eyeHeight;
    this.input = input;
    this.settings = settings;

    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0; // actual ground speed of the last step (m/s)
    this.speedMultiplier = 1; // lowered while carrying heavy parts
    this.weight = 0; // 0..1 load being carried: heavier head bob and footsteps
    this.onFootstep = null; // ({ surface: 'concrete'|'epoxy', running }) => void

    this.phase = 0;
    this.bobGain = 0;
    this.runBlend = 0;
    this.moved = { x: 0, z: 0 };
  }

  teleport(x, z, yawDeg = this.yaw, pitchDeg = 0) {
    this.pos.x = x;
    this.pos.z = z;
    this.vel.x = this.vel.z = 0;
    this.speed = 0;
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    this.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), -MAX_PITCH, MAX_PITCH);
    this.collision.resolve(this.pos);
    this.phase = Math.ceil(this.phase / TWO_PI) * TWO_PI; // no footstep from the jump
    this.bobGain = 0;
    this.applyToCamera();
  }

  get() {
    return {
      x: this.pos.x,
      y: this.camera.position.y,
      z: this.pos.z,
      yawDeg: THREE.MathUtils.radToDeg(this.yaw),
      pitchDeg: THREE.MathUtils.radToDeg(this.pitch),
      speed: this.speed,
      surface: surfaceAt(this.pos.x, this.pos.z),
    };
  }

  aimAt(x, y, z) {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = THREE.MathUtils.clamp(Math.atan2(y - this.eyeHeight, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
    this.applyToCamera();
  }

  /** Per-frame update from the live input. */
  update(dt) {
    const i = this.input;
    const down = (...codes) => codes.some((c) => i.isDown(c));
    const look = i.consumeLook();
    this.step(dt, {
      forward: (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0),
      strafe: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
      run: down('ShiftLeft', 'ShiftRight'),
      lookYaw: look.yaw,
      lookPitch: look.pitch,
    });
  }

  /** Advance the simulation. cmd: { forward, strafe, run, lookYaw, lookPitch } (forward/strafe in -1..1, look in radians). */
  step(dt, cmd) {
    this.yaw += cmd.lookYaw ?? 0;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (cmd.lookPitch ?? 0), -MAX_PITCH, MAX_PITCH);

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let wx = fx * (cmd.forward ?? 0) + -fz * (cmd.strafe ?? 0);
    let wz = fz * (cmd.forward ?? 0) + fx * (cmd.strafe ?? 0);
    const wish = Math.hypot(wx, wz);
    if (wish > 1) {
      wx /= wish;
      wz /= wish;
    }
    const running = !!cmd.run && wish > 0;
    const top = (running ? RUN_SPEED : WALK_SPEED) * this.speedMultiplier;
    const k = approach(wish > 0 ? ACCEL_RATE : DECEL_RATE, dt);
    this.vel.x += (wx * top - this.vel.x) * k;
    this.vel.z += (wz * top - this.vel.z) * k;
    if (wish === 0 && Math.hypot(this.vel.x, this.vel.z) < 0.02) this.vel.x = this.vel.z = 0;

    const before = { x: this.pos.x, z: this.pos.z };
    this.collision.move(this.pos, this.vel.x * dt, this.vel.z * dt);
    this.collision.slideVelocity(this.vel);
    const dx = this.pos.x - before.x;
    const dz = this.pos.z - before.z;
    const dist = Math.hypot(dx, dz);
    this.speed = dt > 0 ? dist / dt : 0;

    this.#bob(dt, dist, running);
    this.applyToCamera();
  }

  #bob(dt, dist, running) {
    this.runBlend += ((running && this.speed > WALK_SPEED * 0.8 ? 1 : 0) - this.runBlend) * approach(6, dt);
    const mode = this.#bobMode();
    const before = Math.floor(this.phase / TWO_PI);
    this.phase += (dist / mode.stride) * TWO_PI;
    this.bobGain += (Math.min(1, this.speed / WALK_SPEED) - this.bobGain) * approach(10, dt);
    if (Math.floor(this.phase / TWO_PI) !== before && this.speed > 0.6) {
      this.onFootstep?.({ surface: surfaceAt(this.pos.x, this.pos.z), running: this.runBlend > 0.5, weight: this.weight });
    }
  }

  // A load makes the steps shorter and the body rock more: lift and roll grow, the stride shrinks.
  #bobMode() {
    const w = this.weight;
    return {
      stride: lerp(BOB.walk.stride, BOB.run.stride, this.runBlend) * (1 - 0.2 * w),
      lift: lerp(BOB.walk.lift, BOB.run.lift, this.runBlend) * (1 + 1.1 * w),
      sway: lerp(BOB.walk.sway, BOB.run.sway, this.runBlend) * (1 + 0.6 * w),
      roll: lerp(BOB.walk.roll, BOB.run.roll, this.runBlend) * (1 + 0.8 * w),
    };
  }

  /** Write position, orientation and FOV into the camera. */
  applyToCamera() {
    const bobOn = this.settings.cameraBob !== false;
    const m = this.#bobMode();
    const g = bobOn ? this.bobGain : 0;
    const half = Math.sin(this.phase / 2);
    const lateral = m.sway * g * half;
    const cam = this.camera;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * lateral,
      this.eyeHeight - 0.5 * m.lift * g * Math.cos(this.phase),
      this.pos.z - Math.sin(this.yaw) * lateral,
    );
    cam.rotation.set(this.pitch, this.yaw, m.roll * g * half, 'YXZ');
    const fov = BASE_FOV + RUN_FOV_KICK * this.runBlend;
    if (Math.abs(fov - cam.fov) > 0.005) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
