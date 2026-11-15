import * as THREE from 'three';
import { disposeObject3D } from '../../core/sceneManager.js';
import { el, keyCap } from '../../core/ui.js';
import { leave } from '../../ui/motion.js';
import { partInfoCard, partTitle } from '../../ui/panels.js';
import { getPart } from '../../data/components.js';
import { layout } from './layout.js';
import { Collision } from './collision.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { buildPlaceholderWorld } from './placeholderWorld.js';
import { runSelfTest } from './selfTest.js';

const NEXT_BUILD_TOAST = 'Assembly arrives in the next build';
const CONSOLE_REACHED_M = 2.6; // objective: within this distance of the console
const HINT_SECONDS = 9; // how long the controls hint stays after the first step

let session = null;

function buildHint() {
  const chip = el('div', 'night hint-chip enter');
  chip.append(
    keyCap('WASD', { night: true }), el('span', '', 'Move'),
    keyCap('Shift', { night: true }), el('span', '', 'Run'),
    keyCap('E', { night: true }), el('span', '', 'Interact'),
    keyCap('Esc', { night: true }), el('span', '', 'Menu'),
  );
  return chip;
}

/** Aim point (world) of an interactable: the centre of its hit box. */
function centreOf(entry) {
  entry.proxy.updateWorldMatrix(true, false);
  return entry.proxy.getWorldPosition(new THREE.Vector3());
}

function createScene(ctx) {
  const world = buildPlaceholderWorld(layout);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 250);
  const collision = new Collision(layout.COLLIDERS, layout.HALL, layout.PLAYER.radius);
  const player = new Player(camera, collision, layout.PLAYER, { input: ctx.input, settings: ctx.settings });

  const peek = ctx.ui.screen('screen--peek');
  const bottom = ctx.ui.screen('screen--bottom');
  const hint = bottom.appendChild(el('div', 'hud-bottom')).appendChild(buildHint());
  const interaction = new Interaction({ camera, ui: ctx.ui, collision, hud: peek });

  const toast = () => ctx.ui.toast(NEXT_BUILD_TOAST);
  for (const rack of layout.RACKS) {
    for (const slot of rack.slots) {
      const part = getPart(slot.partId);
      interaction.register({
        object: world.parts.get(part.id),
        kind: 'part',
        id: part.id,
        label: partTitle(part),
        verb: 'Pick up',
        reach: layout.REACH.part,
        info: () => partInfoCard(part, { actions: false }),
        onInteract: toast,
      });
    }
  }
  interaction.register({
    object: world.stations.console, kind: 'station', id: 'console', label: '', verb: 'Open Mission Console',
    reach: layout.REACH.station, outlineWidth: 0.025, onInteract: toast,
  });
  interaction.register({
    object: world.stations.launch_ctl, kind: 'station', id: 'launch_ctl', label: '', verb: 'Launch Control',
    reach: layout.REACH.station, outlineWidth: 0.025, onInteract: toast,
  });

  return { world, camera, collision, player, interaction, peek, bottom, hint };
}

function aimPoint(s, id) {
  const entry = s.interaction.entries.get(id);
  if (entry) return centreOf(entry);
  const rack = layout.RACKS.find((r) => r.id === id);
  if (rack) return new THREE.Vector3(rack.x, 1.1, rack.z);
  const fixed = {
    stand: [layout.STAND.x, 0.9, layout.STAND.z],
    encap: [layout.ENCAP.x, 1.3, layout.ENCAP.z],
    launcher: [layout.ROCKET.x, layout.ROCKET.tipY, layout.ROCKET.z],
  }[id];
  if (!fixed) throw new Error(`Unknown hangar target: ${id}`);
  return new THREE.Vector3(...fixed);
}

function installDebugApi(ctx, s) {
  const { player, interaction } = s;
  const lookAt = (id) => {
    const p = aimPoint(s, id);
    player.aimAt(p.x, p.y, p.z);
    interaction.refresh();
  };
  const api = {
    layout,
    player: {
      teleport(x, z, yawDeg, pitchDeg) {
        player.teleport(x, z, yawDeg, pitchDeg);
        interaction.refresh();
      },
      get: () => player.get(),
      /** Deterministic test aid: step the controller `seconds` at fixed dt with a held command, e.g. { forward: 1, run: true }. */
      simulate(seconds, cmd, dt = 1 / 60) {
        for (let t = 0; t < seconds - 1e-9; t += dt) player.step(dt, cmd);
        interaction.refresh();
        return player.get();
      },
      get footsteps() { return session.footsteps; },
      get speedMultiplier() { return player.speedMultiplier; },
      set speedMultiplier(v) { player.speedMultiplier = v; },
    },
    gotoStation(id) {
      const st = layout.STATIONS[id];
      if (!st) throw new Error(`Unknown station: ${id}`);
      player.teleport(st.x, st.z, st.yawDeg, 0);
      lookAt(id);
    },
    lookAt,
    focused: () => {
      interaction.refresh();
      const f = interaction.focused();
      return f && { id: f.id, kind: f.kind, label: f.label, verb: f.verb, distance: f.distance };
    },
    interact: () => interaction.interact(),
    selfTest: () => runSelfTest(api, { player, collision: s.collision }, layout),
  };
  window.__fl.hangar = api;
  window.__fl.player = {
    teleport: (x, y, z, yawDeg, pitchDeg) => api.player.teleport(x, z, yawDeg, pitchDeg),
    get: () => player.get(),
  };
  window.__fl.interact = api.interact;
  return api;
}

export default {
  id: 'hangar',
  look: true,
  pausable: true,

  async enter(ctx) {
    try {
      await document.fonts?.load('600 40px Inter'); // the sign textures are drawn on a canvas
    } catch {
      /* fallback fonts are fine */
    }
    const s = createScene(ctx);
    session = { ctx, s, reached: false, hintTimer: 0, moved: false, footsteps: { count: 0, last: null } };
    s.player.onFootstep = ({ surface, running }) => {
      session.footsteps = { count: session.footsteps.count + 1, last: { surface, running } };
      const name = `step.${surface}`;
      if (ctx.audio.buffers.has(name)) ctx.audio.play(name, { bus: 'sfx', volume: running ? 0.7 : 0.5, rate: 0.94 + Math.random() * 0.12 });
    };
    s.player.teleport(layout.SPAWN.x, layout.SPAWN.z, layout.SPAWN.yawDeg, layout.SPAWN.pitchDeg);
    ctx.renderer.setView(s.world.scene, s.camera);
    ctx.ui.setObjective('First steps', [{ text: 'Walk to the Mission Console', done: false }]);

    const api = installDebugApi(ctx, s);
    if (ctx.state.params.selftest) setTimeout(() => api.selfTest(), 0);
  },

  update(dt) {
    const { ctx, s } = session;
    s.player.update(dt);
    s.interaction.update(dt);
    if (ctx.input.pressed('KeyE')) s.interaction.interact();

    if (!session.moved && s.player.speed > 0.5) session.moved = true;
    if (session.moved && s.hint.isConnected) {
      session.hintTimer += dt;
      if (session.hintTimer > HINT_SECONDS) leave(s.hint);
    }
    if (!session.reached) {
      const c = layout.CONSOLE;
      if (Math.hypot(s.player.pos.x - c.x, s.player.pos.z - c.z) < CONSOLE_REACHED_M) {
        session.reached = true;
        ctx.ui.setObjective('First steps', [{ text: 'Walk to the Mission Console', done: true }]);
        ctx.ui.sfx('confirm');
      }
    }
  },

  exit() {
    const { s } = session;
    delete window.__fl.hangar;
    delete window.__fl.player;
    delete window.__fl.interact;
    s.interaction.dispose();
    s.peek.remove();
    s.bottom.remove();
    disposeObject3D(s.world.scene);
    session = null;
  },
};
