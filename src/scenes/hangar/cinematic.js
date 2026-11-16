// Plays the integration cinematic: takes the camera and the satellite away from the player, follows the
// choreography (integration.js), and leaves the world in its "integrated" state - satellite sealed under the
// fairing on top of the rocket, fairing-half colliders gone, state.integrated set, player at Launch Control.
import * as THREE from 'three';
import { el, keyCap } from '../../core/ui.js';
import { EVENTS, SKIP_AFTER, createChoreography } from './integration.js';

const BAR_SLIDE_MS = 700;
const FADE_OUT_S = 0.3;
const FADE_IN_S = 0.5;
const SHAKE_DECAY = 6; // 1/s
const LAUNCH_VIEW_PITCH_DEG = 34; // the rocket and its new payload fill the view at Launch Control
const HALF_COLLIDERS = ['encap_half_w', 'encap_half_e'];

/** Height of the visible satellite above its base (hidden ghost copies and spare part forms do not count). */
function heightAboveBase(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box.isEmpty() ? 2 : box.max.y - root.getWorldPosition(new THREE.Vector3()).y;
}

export class IntegrationCinematic {
  /**
   * @param {object} deps
   * @param {object} deps.ctx app context
   * @param {object} deps.world placeholder world ({ rig })
   * @param {THREE.PerspectiveCamera} deps.camera
   * @param {import('./player.js').Player} deps.player
   * @param {import('./assembly.js').Assembly} deps.assembly
   * @param {import('./collision.js').Collision} deps.collision
   * @param {import('./interaction.js').Interaction} deps.interaction
   * @param {import('./objectives.js').HangarObjectives} deps.objectives
   * @param {HTMLElement[]} deps.huds HUD screens hidden while it plays
   * @param {object} deps.layout
   */
  constructor({ ctx, world, camera, player, assembly, collision, interaction, objectives, huds, layout }) {
    Object.assign(this, { ctx, camera, player, assembly, collision, interaction, objectives, huds, layout });
    this.rig = world.rig;
    this.active = false;
    this.paused = false;
    this.speed = 1;
    this.t = 0;
    this.choreo = null;
    this.sounds = []; // { name, t } of the sound hooks fired
    this.shake = 0;
    this.finishing = false;
    this.resolve = null;
    this.onLockChange = () => {
      if (this.active && !document.pointerLockElement && this.t >= SKIP_AFTER) this.skip();
    };

    this.cinema = ctx.ui.screen('screen--cinema');
    this.barTop = this.cinema.appendChild(el('div', 'cinema__bar cinema__bar--top'));
    this.barBottom = this.cinema.appendChild(el('div', 'cinema__bar cinema__bar--bottom'));
    this.hint = this.cinema.appendChild(el('div', 'night hint-chip cinema__hint enter'));
    this.hint.append(keyCap('Space', { night: true }), el('span', '', 'Skip'));
    this.hint.hidden = true;
  }

  /** Current state for tests: { active, t, shot, cargo, finished }. */
  get() {
    const s = this.choreo?.sample(this.t);
    return { active: this.active, paused: this.paused, t: +this.t.toFixed(3), shot: s?.shot ?? null, cargo: s?.cargo ?? null, integrated: this.ctx.state.integrated, sounds: this.sounds.map((x) => x.name) };
  }

  /** Park the crane over the rocket and the payload open on its cell (the world before integration). */
  rest() {
    this.#prepare();
    this.#pose({ ...this.choreo.sample(0), hook: [this.layout.ROCKET.x, this.layout.CRANE.hookMaxY, this.layout.ROCKET.z], cargo: null });
  }

  /** The finished world without playing anything (scene start with ?integrated=1, skipping). */
  settleIntegrated() {
    this.#prepare();
    this.#pose(this.choreo.sample(this.choreo.duration));
    this.#finalWorld();
    this.#placePlayer();
  }

  /**
   * Play the cinematic. hold: start paused at t = 0 (tests seek through it). Resolves when the world is integrated.
   * Ignored when the payload is already integrated or a cinematic is running.
   */
  start({ hold = false } = {}) {
    if (this.active || this.ctx.state.integrated) return Promise.resolve(false);
    const { assembly, interaction, ctx } = this;
    assembly.settle();
    if (assembly.carrying) assembly.putBack({ instant: true });
    assembly.locked = true;
    for (const part of assembly.satellite.slots.values()) assembly.fx.bolts.unfasten(part);
    this.#prepare();

    this.active = true;
    this.paused = hold;
    this.finishing = false;
    this.t = 0;
    this.sounds.length = 0;
    this.fired = new Set();
    interaction.clear();
    ctx.ui.clearObjective();
    ctx.ui.showCrosshair(false);
    for (const hud of this.huds) hud.hidden = true;
    this.barTop.classList.add('is-on');
    this.barBottom.classList.add('is-on');
    this.hint.hidden = true;
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.#pose(this.choreo.sample(0));
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  /** Jump to time t (tests, screenshots): poses everything there without firing sounds. */
  seek(t) {
    if (!this.active) return;
    this.t = THREE.MathUtils.clamp(t, 0, this.choreo.duration);
    for (const e of EVENTS) if (e.t <= this.t) this.fired.add(e);
    this.#pose(this.choreo.sample(this.t));
  }

  /** Space / Esc after the first second: straight to the end. */
  skip() {
    if (this.active && !this.finishing && this.t >= SKIP_AFTER) this.#finish(false);
  }

  update(dt) {
    if (!this.active || this.finishing) return;
    const { input } = this.ctx;
    if (input.pressed('Space') || input.pressed('Escape')) this.skip();
    if (this.finishing) return;
    if (!this.paused) {
      this.t = Math.min(this.choreo.duration, this.t + dt * this.speed);
      for (const e of EVENTS) {
        if (e.t > this.t || this.fired.has(e)) continue;
        this.fired.add(e);
        this.#event(e);
      }
    }
    this.#pose(this.choreo.sample(this.t));
    this.shake *= Math.exp(-SHAKE_DECAY * dt);
    if (this.shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.hint.hidden = this.t < SKIP_AFTER;
    if (this.t >= this.choreo.duration) this.#finish(true);
  }

  /** Complete at once, without fades (debug `integrate({ skip: true })`). */
  completeNow() {
    if (!this.active) return;
    this.#endMode();
    this.#finalWorld();
    this.#placePlayer();
    this.#resolve();
  }

  dispose() {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.cinema.remove();
  }

  // ------------------------------------------------------------------ internals

  #prepare() {
    const top = heightAboveBase(this.assembly.satellite.root);
    this.choreo = createChoreography({ satelliteTop: top });
    this.rig.setSatelliteTop(top);
  }

  /** Put the rig, the satellite and the camera where the sample says. */
  #pose(sample) {
    this.rig.apply(sample);
    this.assembly.satellite.root.position.fromArray(sample.satellite);
    if (!this.active) return;
    const cam = this.camera;
    cam.position.fromArray(sample.camera.pos);
    cam.lookAt(...sample.camera.look);
    if (cam.fov !== sample.camera.fov) {
      cam.fov = sample.camera.fov;
      cam.updateProjectionMatrix();
    }
  }

  #event(e) {
    if (e.shake) this.shake = Math.max(this.shake, e.shake);
    this.sounds.push({ name: e.sound, t: +this.t.toFixed(2) });
    const { audio } = this.ctx;
    if (audio.buffers.has(e.sound)) audio.play(e.sound, { bus: 'sfx', volume: 0.8 });
  }

  async #finish(played) {
    this.finishing = true;
    const { ui } = this.ctx;
    await ui.fade(1, played ? FADE_OUT_S : FADE_OUT_S * 0.6);
    this.#endMode();
    this.#finalWorld();
    this.#placePlayer();
    ui.fade(0, FADE_IN_S);
    this.#resolve();
  }

  #resolve() {
    this.resolve?.(true);
    this.resolve = null;
  }

  // Back to the player's view: bars out, HUD back, camera and fov restored by the next player.applyToCamera().
  #endMode() {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.active = false;
    this.finishing = false;
    this.paused = false;
    this.barTop.classList.remove('is-on');
    this.barBottom.classList.remove('is-on');
    this.hint.hidden = true;
    for (const hud of this.huds) hud.hidden = false;
    this.ctx.ui.showCrosshair(true);
  }

  /** The world after integration: payload sealed on the rocket, satellite inside it, no halves to bump into. */
  #finalWorld() {
    const { rig, assembly, ctx, collision, objectives, layout } = this;
    this.#pose({ ...this.choreo.sample(this.choreo.duration), hook: [layout.ROCKET.x, layout.CRANE.hookMaxY, layout.ROCKET.z], cargo: null });
    for (const part of assembly.satellite.slots.values()) assembly.fx.bolts.clear(part);
    const sat = assembly.satellite.root;
    rig.payload.add(sat);
    sat.position.set(0, layout.PAYLOAD.ringH, 0);
    for (const id of HALF_COLLIDERS) collision.remove(id);
    assembly.locked = true;
    ctx.state.integrated = true;
    objectives.setStage('launch');
    this.interaction.refresh();
  }

  #placePlayer() {
    const st = this.layout.STATIONS.launch_ctl;
    this.player.teleport(st.x, st.z, st.yawDeg, LAUNCH_VIEW_PITCH_DEG);
    this.interaction.refresh();
  }
}
