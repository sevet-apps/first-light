// Hangar assembly: the player physically builds the satellite. Pick up a part from a rack, carry it (weight slows
// you), see a ghost of where it goes, install it with a short animation, remove or swap it, or put it back.
// Owns the satellite on the stand, the held part, the ghost, the effects and the build sheet. The placeholder part
// models attach only through named sockets (data/sockets.js), so the Blender models can replace them unchanged.
import * as THREE from 'three';
import { CATEGORIES, getPart } from '../../data/components.js';
import { presets } from '../../data/presets.js';
import { compatibilityFor, evaluateAssembly } from '../../sim/assembly.js';
import { el, keyCap } from '../../core/ui.js';
import { leave } from '../../ui/motion.js';
import { partInfoCard, partTitle } from '../../ui/panels.js';
import { buildSheet, sheetDelta, sheetFigures } from '../../ui/buildSheet.js';
import { Carry, loadFactor, speedMultiplierFor } from './carry.js';
import { InstallFx } from './fx.js';
import { Flight, Timeline, clamp01, easeInOut } from './flight.js';
import { Ghost } from './ghost.js';
import { Part, Pose, Satellite } from './satellite.js';

// Seconds. Install = flight + settle + bolts (about 1.1 s); remove = unbolt + flight.
const T = { pickup: 0.45, unbolt: 0.3, remove: 0.6, flight: 0.55, settle: 0.13, bolts: 0.4 };
const SEAT_DEPTH = 0.02; // a part presses this far into its socket before settling
const BOLT_MARGIN = 0.035; // bolts sit this far outside the part's footprint, on the mounting face
const NUDGE = { seconds: 0.45, pitch: 0.011, drop: 0.006 };
const SOUND_LOG = 40;
const REMOVE_PARTS_FIRST = 'Remove the other parts first';

const UP = new THREE.Vector3(0, 1, 0);

export class Assembly {
  /**
   * @param {object} deps
   * @param {object} deps.ctx app context (ui, audio, state)
   * @param {object} deps.world placeholder world: { scene, parts: Map(partId -> root Group) }
   * @param {THREE.PerspectiveCamera} deps.camera
   * @param {import('./player.js').Player} deps.player
   * @param {import('./interaction.js').Interaction} deps.interaction
   * @param {HTMLElement} deps.bottom container of the bottom HUD (carry chip)
   * @param {HTMLElement} deps.top container of the top-right HUD (build sheet)
   * @param {import('./objectives.js').HangarObjectives} deps.objectives
   * @param {object} deps.layout
   */
  constructor({ ctx, world, camera, player, interaction, bottom, top, objectives, layout }) {
    this.ctx = ctx;
    this.scene = world.scene;
    this.camera = camera;
    this.player = player;
    this.interaction = interaction;
    this.objectives = objectives;
    this.layout = layout;
    this.bottom = bottom;

    this.parts = new Map();
    for (const [id, root] of world.parts) this.parts.set(id, new Part(getPart(id), root));
    this.satellite = new Satellite(this.scene, layout.sockets.bus, this.parts);
    this.carry = new Carry({ camera, player });
    this.ghost = new Ghost(this.satellite);
    this.fx = new InstallFx(this.scene);
    this.sheet = buildSheet(ctx.state.mission, sheetFigures({}, ctx.state.mission));
    top.append(this.sheet.node);

    this.carrying = null;
    this.busy = false;
    this.tasks = [];
    this.chip = null;
    this.nudge = 1e9;
    this.timeScale = 1; // debug: slows every animation so a screenshot can catch a moment of it
    this.sounds = [];
    this.markers = this.#buildMarkers();
    this.standTarget = this.#buildStandTarget();
    this.#register();
  }

  // ------------------------------------------------------------------ queries

  /** Can `part` go on the stand right now? -> { ok, reason, swap } (swap = the part it would replace). */
  evaluate(part) {
    const occupant = this.satellite.slots.get(part.category) ?? null;
    if (part.category === 'bus' && occupant && this.satellite.slots.size > 1) {
      return { ok: false, reason: `Remove the other parts before swapping the ${occupant.def.shortName} bus.`, swap: null };
    }
    const compat = compatibilityFor(part.id, { ...this.ctx.state.assembly });
    return compat.ok ? { ok: true, reason: '', swap: occupant } : { ok: false, reason: compat.reason, swap: null };
  }

  /** Snapshot for tests and the debug overlay. */
  get() {
    const assembly = { ...this.ctx.state.assembly };
    return {
      carrying: this.carrying?.id ?? null,
      busy: this.busy,
      installed: Object.fromEntries([...this.satellite.slots].map(([cat, p]) => [cat, p.id])),
      assembly,
      parts: Object.fromEntries([...this.parts].map(([id, p]) => [id, p.state])),
      totals: evaluateAssembly(assembly, this.ctx.state.mission).totals,
      speedMultiplier: this.player.speedMultiplier,
      weight: this.player.weight,
      ghost: { visible: this.ghost.group.visible, part: this.ghost.part?.id ?? null, valid: this.ghost.valid },
      objective: this.objectives.state,
      animation: this.tasks.map((tl) => ({ t: +tl.t.toFixed(3), duration: +tl.duration.toFixed(3) })),
      sounds: this.sounds.map((s) => s.name),
    };
  }

  // ------------------------------------------------------------------ actions

  /** Pick a part up from its rack. Resolves when the part is in the hands. */
  async pick(partId, { instant = false } = {}) {
    const part = this.parts.get(partId);
    if (!part) return { ok: false, reason: `Unknown part ${partId}.` };
    if (this.busy) return { ok: false, reason: 'Wait for the current action to finish.' };
    if (this.carrying) return { ok: false, reason: 'Your hands are full.' };
    if (part.state !== 'rack') return { ok: false, reason: 'That part is not on its rack.' };
    this.objectives.walkDone({ immediate: true });
    this.#grab(part);
    this.#sound('pickup');
    const from = Pose.fromObject(part.root);
    const pose = new Pose();
    const tl = new Timeline(T.pickup);
    tl.update = (t) => {
      const k = easeInOut(t / T.pickup);
      pose.blend(from, this.carry.target(), k);
      pose.position.y += Math.sin(Math.PI * k) * 0.12;
      pose.applyTo(part.root);
    };
    tl.at(T.pickup, () => {
      part.state = 'carried';
      this.carry.snap(this.carry.target());
    });
    await this.#run(tl, { instant });
    return { ok: true };
  }

  /** Install (or swap in) the carried part. Resolves when the animation is over. */
  async install({ instant = false } = {}) {
    const part = this.carrying;
    if (!part || part.state !== 'carried') return { ok: false, reason: 'You are not holding a part.' };
    if (this.busy) return { ok: false, reason: 'Wait for the current action to finish.' };
    const verdict = this.evaluate(part);
    if (!verdict.ok) {
      this.ctx.ui.sfx('error');
      return { ok: false, reason: verdict.reason };
    }
    await this.#run(this.#installTimeline(part, verdict.swap), { instant });
    return { ok: true, swapped: verdict.swap?.id ?? null };
  }

  /** Take the part in `category` off the satellite into the hands. */
  async remove(category, { instant = false } = {}) {
    const part = this.satellite.slots.get(category);
    if (!part) return { ok: false, reason: `Nothing is installed in ${category}.` };
    if (this.busy) return { ok: false, reason: 'Wait for the current action to finish.' };
    if (this.carrying) return { ok: false, reason: 'Your hands are full.' };
    if (this.#carriesOthers(part)) {
      this.ctx.ui.sfx('error');
      return { ok: false, reason: REMOVE_PARTS_FIRST };
    }
    await this.#run(this.#removeTimeline(part), { instant });
    return { ok: true, part: part.id };
  }

  /** Q: the carried part flies back to its rack slot. Hands are free at once; the flight does not block you. */
  async putBack({ instant = false } = {}) {
    const part = this.carrying;
    if (!part || part.state !== 'carried' || this.busy) return { ok: false, reason: 'Nothing to put back.' };
    this.#drop();
    part.state = 'moving';
    const from = Pose.fromObject(part.root);
    const to = part.rackPose;
    const distance = from.position.distanceTo(to.position);
    const flight = THREE.MathUtils.clamp(0.45 + 0.035 * distance, 0.5, 1.2);
    const lift = 0.35 + 0.01 * distance;
    const pose = new Pose();
    const tl = new Timeline(flight + T.settle);
    tl.update = (t) => {
      if (t < flight) {
        const k = easeInOut(t / flight);
        pose.blend(from, to, k);
        pose.position.y += Math.sin(Math.PI * k) * lift;
      } else {
        pose.copy(to);
        pose.position.y += 0.015 * Math.sin((Math.PI * (t - flight)) / T.settle);
      }
      pose.applyTo(part.root);
    };
    tl.at(flight, () => this.#sound('putback'));
    tl.at(flight + T.settle, () => {
      to.applyTo(part.root);
      part.state = 'rack';
    });
    await this.#run(tl, { instant, blocking: false });
    return { ok: true, part: part.id };
  }

  /**
   * Replace the satellite with `assembly` ({category: partId}) or a preset name. Refused parts (incompatible with the
   * bus) stay on their racks. instant (default) skips all animation; animated walks each part through pick + install.
   * Returns { installed: [partId], refused: [{ partId, reason }] }.
   */
  async autoAssemble(source, { animated = false } = {}) {
    const given = typeof source === 'string' ? presets[source] : source;
    if (!given) throw new Error(`Unknown assembly preset: ${source}`);
    const wanted = { ...given }; // state.assembly itself may be the source, and clearAll empties it
    this.clearAll();
    const installed = [];
    const refused = [];
    for (const cat of CATEGORIES) {
      const part = this.parts.get(wanted[cat]);
      if (!part) continue;
      const verdict = this.evaluate(part);
      if (!verdict.ok) {
        refused.push({ partId: part.id, reason: verdict.reason });
        continue;
      }
      if (animated) {
        await this.pick(part.id);
        await this.install();
      } else {
        this.#installNow(part);
      }
      installed.push(part.id);
    }
    return { installed, refused };
  }

  /** Put everything back on the racks at once (tests, restart). */
  clearAll() {
    for (const tl of [...this.tasks]) tl.finish();
    if (this.carrying) {
      const part = this.carrying;
      this.#drop();
      this.#toRack(part);
    }
    for (const part of [...this.satellite.slots.values()].reverse()) {
      this.fx.bolts.clear(part);
      this.satellite.release(part);
      this.#toRack(part);
    }
    this.#commit();
  }

  /** Fast-forward every running animation to its end. */
  settle() {
    for (const tl of [...this.tasks]) tl.finish();
  }

  // ------------------------------------------------------------------ frame

  update(realDt) {
    const dt = realDt * this.timeScale;
    for (const tl of [...this.tasks]) {
      if (tl.step(dt)) this.tasks.splice(this.tasks.indexOf(tl), 1);
    }
    if (this.carrying?.state === 'carried') this.carry.follow(dt);

    const focus = this.interaction.focused();
    if (focus?.id === 'stand' && this.carrying) this.ghost.show(this.carrying, this.evaluate(this.carrying).ok);
    else this.ghost.hide();
    this.ghost.update(dt);
    this.fx.update(dt);
    this.#applyNudge(dt);
    for (const [part, marker] of this.markers) marker.visible = part.state !== 'rack';
    this.sheet.setCompact(!!this.interaction.card);
  }

  dispose() {
    this.tasks.length = 0;
    this.carry.dispose();
    this.ghost.dispose();
    this.fx.dispose();
    this.sheet.node.remove();
    this.chip?.remove();
    this.ctx.ui.root.style.removeProperty('--toast-top');
    for (const marker of this.markers.values()) marker.geometry.dispose();
    this.markerMaterial.dispose();
    this.standTarget.geometry.dispose();
    this.standTarget.material.dispose();
  }

  // ------------------------------------------------------------------ timelines

  #installTimeline(part, occupant) {
    const sat = this.satellite;
    const start = occupant ? T.unbolt : 0;
    const seatAt = start + T.flight;
    const tl = new Timeline(seatAt + T.settle + T.bolts);
    let flightIn = null;
    let flightOut = null;
    let busId = null;

    if (occupant) {
      tl.at(0, () => {
        this.#sound('torque');
        this.fx.bolts.unfasten(occupant);
      });
    }
    tl.at(start, () => {
      const outgoing = occupant ? this.#detach(occupant) : null;
      const incoming = this.#detach(part);
      if (occupant) {
        this.fx.bolts.clear(occupant);
        sat.release(occupant);
      }
      busId = part.category === 'bus' ? part.id : sat.busId;
      part.state = 'moving';
      this.#drop();
      if (occupant) {
        this.#grab(occupant);
        this.#commit();
        flightOut = new Flight({
          starts: outgoing, ends: () => this.#handPoses(occupant), arc: [0, 0.1, 0], morph: 'out',
          from: occupant.mounts.map((m) => occupant.installedNode(m, occupant.category === 'bus' ? occupant.id : busId)),
          to: occupant.mounts.map((m) => m.node),
        });
      }
      const ends = part.mounts.map((m) => this.#toWorld(sat.installedPose(part, m, busId)));
      flightIn = new Flight({
        starts: incoming, ends: () => ends, arc: [0, 0.22, 0], morph: 'in',
        from: part.mounts.map((m) => m.node), to: part.mounts.map((m) => part.installedNode(m, busId)),
      });
    });
    tl.at(seatAt, () => {
      flightIn = null;
      if (flightOut) this.#finishInHands(occupant);
      flightOut = null;
      this.#seat(part);
    });
    tl.at(seatAt + T.settle, () => {
      this.#sound('torque');
      this.fx.bolts.add(part, this.#boltPoints(part), 'in');
    });
    tl.update = (t) => {
      if (flightIn) {
        const k = clamp01((t - start) / T.flight);
        flightIn.apply(k);
        flightOut?.apply(k);
      } else if (t >= seatAt) {
        this.#settle(part, clamp01((t - seatAt) / T.settle), busId);
      }
    };
    return tl;
  }

  #removeTimeline(part) {
    const sat = this.satellite;
    const busId = part.category === 'bus' ? part.id : sat.busId;
    const tl = new Timeline(T.unbolt + T.remove);
    let flight = null;
    tl.at(0, () => {
      this.#sound('torque');
      this.fx.bolts.unfasten(part);
    });
    tl.at(T.unbolt, () => {
      this.fx.bolts.clear(part);
      const starts = this.#detach(part);
      sat.release(part);
      this.#grab(part);
      this.#commit();
      flight = new Flight({
        starts, ends: () => this.#handPoses(part), arc: [0, 0.12, 0], morph: 'out',
        from: part.mounts.map((m) => part.installedNode(m, busId)), to: part.mounts.map((m) => m.node),
      });
    });
    tl.at(T.unbolt + T.remove, () => {
      flight = null;
      this.#finishInHands(part);
    });
    tl.update = (t) => flight?.apply(clamp01((t - T.unbolt) / T.remove));
    return tl;
  }

  // ------------------------------------------------------------------ steps shared by the timelines

  /** Hands take `part`: viewmodel materials, weight, carry readout, build-sheet deltas. */
  #grab(part) {
    this.carrying = part;
    part.state = 'moving';
    this.carry.hold(part);
    this.player.speedMultiplier = speedMultiplierFor(part.def.mass);
    this.player.weight = loadFactor(part.def.mass);
    this.#showChip(part);
    this.#refreshDelta();
  }

  /** Hands let go (the part keeps its own pose and goes back to normal materials). */
  #drop() {
    this.carry.release();
    this.carrying = null;
    this.player.speedMultiplier = 1;
    this.player.weight = 0;
    this.#hideChip();
    this.#refreshDelta();
  }

  /**
   * Move a part's root to the scene origin with its nodes keeping their world poses, so nodes can be animated in
   * world space. Returns the nodes' world poses (installed nodes for an installed part, rack nodes otherwise).
   */
  #detach(part) {
    const installed = part.state === 'installed';
    const busId = part.category === 'bus' ? part.id : this.satellite.busId;
    const nodes = part.mounts.map((m) => (installed ? part.installedNode(m, busId) : m.node));
    part.root.updateWorldMatrix(true, true);
    const poses = nodes.map((n) => Pose.fromMatrix(n.matrixWorld));
    this.scene.add(part.root);
    part.root.position.set(0, 0, 0);
    part.root.quaternion.identity();
    part.root.scale.set(1, 1, 1);
    part.root.updateMatrixWorld(true);
    nodes.forEach((n, i) => poses[i].applyTo(n));
    return poses;
  }

  /** World poses the rack-form nodes of `part` have when it sits in the hands right now. */
  #handPoses(part) {
    const root = this.carry.target().toMatrix();
    return part.mounts.map((m) => Pose.fromMatrix(root.clone().multiply(m.rackPose.toMatrix())));
  }

  /** The held part arrives in the hands: root on the spring, nodes back in their rack arrangement. */
  #finishInHands(part) {
    const root = this.carry.target();
    root.applyTo(part.root);
    for (const m of part.mounts) m.rackPose.applyTo(m.node);
    part.showForm('rack');
    part.state = 'carried';
    this.carry.snap(root);
  }

  #toWorld(localPose) {
    return Pose.fromMatrix(this.satellite.worldMatrix().clone().multiply(localPose.toMatrix()));
  }

  /** Nodes reach their sockets: attach, commit the state, then sparks, glow, clunk and a nudge of the camera. */
  #seat(part) {
    const sat = this.satellite;
    sat.attach(part);
    const busId = part.category === 'bus' ? part.id : sat.busId;
    this.#commit();
    sat.root.updateMatrixWorld(true);
    for (const m of part.mounts) {
      const node = part.installedNode(m, busId);
      const position = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      this.fx.seat(position, UP.clone().transformDirection(node.matrixWorld));
      this.fx.glow(node, m.footprint);
    }
    this.sheet.flash(part.category);
    this.#sound('install_clunk');
    this.nudge = 0;
  }

  /** Tiny overshoot into the socket and back (s: 0..1). */
  #settle(part, s, busId) {
    for (const m of part.mounts) {
      const pose = this.satellite.installedPose(part, m, busId);
      const axis = UP.clone().applyQuaternion(pose.quaternion);
      pose.position.addScaledVector(axis, -SEAT_DEPTH * Math.sin(Math.PI * s));
      pose.applyTo(part.installedNode(m, busId));
    }
  }

  /** Bolt positions (world) and orientations: one on each side of each mount's footprint, on the mounting face. */
  #boltPoints(part) {
    const sat = this.satellite;
    const busId = part.category === 'bus' ? part.id : sat.busId;
    const world = sat.worldMatrix();
    const points = [];
    for (const m of part.mounts) {
      if (!m.bolts) continue;
      const node = new THREE.Matrix4().multiplyMatrices(world, sat.installedPose(part, m, busId).toMatrix());
      const hx = m.footprint.x / 2 + BOLT_MARGIN;
      const hz = m.footprint.z / 2 + BOLT_MARGIN;
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(node));
      for (const [x, z] of [[hx, 0], [-hx, 0], [0, hz], [0, -hz]]) {
        points.push({ position: new THREE.Vector3(x, 0, z).applyMatrix4(node), quaternion });
      }
    }
    return points;
  }

  /** Install without any animation (scene enter, tests). */
  #installNow(part) {
    const sat = this.satellite;
    if (this.carrying === part) this.#drop();
    sat.attach(part);
    sat.root.updateMatrixWorld(true);
    this.fx.bolts.add(part, this.#boltPoints(part), 'seated');
    this.#commit();
  }

  /** Back on its rack, instantly. */
  #toRack(part) {
    this.scene.add(part.root);
    part.rackPose.applyTo(part.root);
    for (const m of part.mounts) m.rackPose.applyTo(m.node);
    part.showForm('rack');
    part.state = 'rack';
  }

  // ------------------------------------------------------------------ state mirrors

  /** Mirror the satellite into state.assembly, then the build sheet and the objectives. */
  #commit() {
    const assembly = this.ctx.state.assembly;
    for (const cat of CATEGORIES) {
      const part = this.satellite.slots.get(cat);
      if (part) assembly[cat] = part.id;
      else delete assembly[cat];
    }
    this.sheet.set(assembly, sheetFigures(assembly, this.ctx.state.mission));
    this.objectives.setInstalled(this.satellite.slots.keys());
    this.#refreshDelta();
  }

  #refreshDelta() {
    const held = this.carrying;
    this.sheet.setDelta(held ? sheetDelta(this.ctx.state.assembly, held.id, this.ctx.state.mission) : null, held?.category ?? null);
  }

  #run(timeline, { instant = false, blocking = true } = {}) {
    return new Promise((resolve) => {
      timeline.onDone = () => {
        if (blocking) this.busy = false;
        resolve();
      };
      if (blocking) this.busy = true;
      if (instant) {
        timeline.finish();
        return;
      }
      this.tasks.push(timeline);
    });
  }

  #sound(name) {
    this.sounds.push({ name, at: performance.now() });
    if (this.sounds.length > SOUND_LOG) this.sounds.shift();
    const { audio } = this.ctx;
    if (audio.buffers.has(name)) audio.play(name, { bus: 'sfx', volume: 0.8 });
  }

  #applyNudge(dt) {
    if (this.nudge >= NUDGE.seconds) return;
    this.nudge += dt;
    const k = this.nudge / NUDGE.seconds;
    const bump = Math.sin(Math.PI * Math.min(1, k * 2)) * (1 - k); // quick dip, slow recovery
    this.camera.rotation.x -= NUDGE.pitch * bump;
    this.camera.position.y -= NUDGE.drop * bump;
  }

  // ------------------------------------------------------------------ HUD

  #showChip(part) {
    this.chip?.remove();
    const chip = el('div', 'night carry-chip enter');
    chip.append(
      el('span', '', 'Carrying'), el('b', '', partTitle(part.def)), el('span', 'carry-chip__mass', `${part.def.mass} kg`),
      keyCap('Q', { night: true }), el('span', '', 'Put back'),
    );
    this.bottom.prepend(chip);
    this.chip = chip;
  }

  #hideChip() {
    if (this.chip) leave(this.chip);
    this.chip = null;
  }

  /** Toast below the build sheet. */
  toast(text, options) {
    const bottom = this.sheet.node.getBoundingClientRect().bottom;
    this.ctx.ui.root.style.setProperty('--toast-top', `${Math.round(bottom + 12)}px`);
    return this.ctx.ui.toast(text, options);
  }

  // ------------------------------------------------------------------ scene objects and interaction entries

  #buildMarkers() {
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xf1ece2, transparent: true, opacity: 0.2, depthWrite: false });
    const markers = new Map();
    for (const rack of this.layout.RACKS) {
      for (const slot of rack.slots) {
        const [w, , d] = slot.size;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, 0.2) + 0.1, Math.max(d, 0.2) + 0.1).rotateX(-Math.PI / 2), this.markerMaterial);
        mesh.position.set(slot.x, this.layout.RACK_TOP + 0.004, slot.z);
        mesh.rotation.y = (slot.yawDeg * Math.PI) / 180;
        mesh.visible = false;
        this.scene.add(mesh);
        markers.set(this.parts.get(slot.partId), mesh);
      }
    }
    return markers;
  }

  /** Invisible volume over the stand and the satellite: what you aim at to install. */
  #buildStandTarget() {
    const { x, z } = this.layout.STAND;
    const { w, y0, h } = this.layout.ASSEMBLY.target;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.set(x, y0 + h / 2, z);
    this.scene.add(mesh);
    return mesh;
  }

  /** True for a bus that still holds other parts (it cannot be removed). */
  #carriesOthers(part) {
    return part.category === 'bus' && this.satellite.slots.size > 1;
  }

  #register() {
    const { interaction, layout } = this;
    const handsFree = () => !this.carrying && !this.busy;

    for (const part of this.parts.values()) {
      const title = partTitle(part.def);
      interaction.register({
        object: part.root, kind: 'part', id: part.id, label: title, verb: 'Pick up', reach: layout.REACH.part,
        enabled: () => part.state === 'rack' && !this.busy,
        prompt: () => (this.carrying
          ? { key: 'Q', verb: 'Hands full — put back', label: this.carrying.def.shortName }
          : { key: 'E', verb: 'Pick up', label: title }),
        info: () => (this.carrying ? null : partInfoCard(part.def, { actions: false })),
        onInteract: () => this.carrying ? this.ctx.ui.sfx('error') : this.pick(part.id),
      });
      interaction.register({
        object: part.root, kind: 'installed', id: `installed:${part.id}`, label: title, verb: 'Remove', reach: layout.REACH.part + 0.5,
        precise: true, outlineWidth: 0.01,
        enabled: () => part.state === 'installed' && handsFree(),
        prompt: () => (part.category === 'bus' && this.satellite.slots.size > 1
          ? { key: null, verb: REMOVE_PARTS_FIRST, label: 'the bus carries them', tone: 'bad' }
          : { key: 'E', verb: 'Remove', label: title }),
        info: () => (this.#carriesOthers(part) ? null : partInfoCard(part.def, { assembly: this.ctx.state.assembly, installed: true, actions: false })),
        onInteract: () => this.remove(part.category),
      });
    }

    interaction.register({
      object: this.standTarget, kind: 'stand', id: 'stand', label: '', verb: 'Install', reach: layout.ASSEMBLY.reach,
      outline: false,
      enabled: () => !!this.carrying && this.carrying.state === 'carried' && !this.busy,
      prompt: () => {
        const part = this.carrying;
        const verdict = this.evaluate(part);
        if (!verdict.ok) return { key: null, verb: verdict.reason, label: '', tone: 'bad' };
        return { key: 'E', verb: verdict.swap ? 'Swap' : 'Install', label: partTitle(part.def) };
      },
      onInteract: () => this.install(),
    });
  }
}
