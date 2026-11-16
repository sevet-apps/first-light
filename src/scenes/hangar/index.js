import * as THREE from 'three';
import { disposeObject3D } from '../../core/sceneManager.js';
import { el, keyCap } from '../../core/ui.js';
import { leave } from '../../ui/motion.js';
import { getPart } from '../../data/components.js';
import { fmtMB } from '../../data/format.js';
import { evaluateAssembly } from '../../sim/assembly.js';
import { launchControlCard, missionConsole } from '../../ui/hangarDocs.js';
import { layout } from './layout.js';
import { Assembly } from './assembly.js';
import { runAssemblySelfTest } from './assemblySelfTest.js';
import { HangarObjectives } from './objectives.js';
import { IntegrationCinematic } from './cinematic.js';
import { Collision } from './collision.js';
import { PaperOverlay } from './paperOverlay.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { buildPlaceholderWorld } from './placeholderWorld.js';
import { runSelfTest } from './selfTest.js';
import { prepareDetailModels, detailModel, detailColliders } from '../shared/detailModels.js';

const CONSOLE_REACHED_M = 2.6; // objective: within this distance of the console
const HINT_MAX_SECONDS = 30; // the controls hint fades after this long, or sooner once you have moved and interacted
const REFUSED_TOAST_DELAY_MS = 900; // let the scene fade in before reporting parts that did not fit
const TAB_KEYS = { Digit1: 'brief', Digit2: 'readiness', Digit3: 'integrate' };

let session = null;

function buildHint() {
  const chip = el('div', 'night hint-chip enter');
  chip.append(
    keyCap('WASD', { night: true }), el('span', '', 'Move'),
    keyCap('Shift', { night: true }), el('span', '', 'Run'),
    keyCap('Space', { night: true }), el('span', '', 'Jump'),
    keyCap('E', { night: true }), el('span', '', 'Interact'),
    keyCap('Esc', { night: true }), el('span', '', 'Menu'),
  );
  return chip;
}

const CONTROLS = [
  [['Click'], 'Capture mouse to look around'],
  [['WASD'], 'Move'], [['Shift'], 'Run'], [['Space'], 'Jump'], [['E'], 'Interact, pick up, install'],
  [['Q'], 'Put back the part you carry'], [['Esc'], 'Pause menu'],
];

/** Controls reminder for the pause menu (paper card). */
function buildHelp() {
  const list = el('ul', 'help');
  for (const [keys, text] of CONTROLS) {
    const li = el('li', 'help__row');
    li.append(...keys.map((k) => keyCap(k)), el('span', '', text));
    list.append(li);
  }
  return list;
}

/** Aim point (world) of an interactable: the centre of its hit box. */
function centreOf(entry) {
  entry.proxy.updateWorldMatrix(true, false);
  return entry.proxy.getWorldPosition(new THREE.Vector3());
}

function createScene(ctx) {
  const world = buildPlaceholderWorld(layout);
  world.scene.add(detailModel('hangar_details'));
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 250);
  const collision = new Collision([...layout.COLLIDERS,...detailColliders()], layout.HALL, layout.PLAYER.radius);
  const player = new Player(camera, collision, layout.PLAYER, { input: ctx.input, settings: ctx.settings });

  const peek = ctx.ui.screen('screen--peek');
  const top = ctx.ui.screen();
  const bottom = ctx.ui.screen('screen--bottom');
  const hudBottom = bottom.appendChild(el('div', 'hud-bottom'));
  const hint = hudBottom.appendChild(buildHint());
  const interaction = new Interaction({ camera, ui: ctx.ui, collision, hud: peek });
  const objectives = new HangarObjectives(ctx.ui);
  const assembly = new Assembly({ ctx, world, camera, player, interaction, bottom: hudBottom, top, objectives, layout });

  const overlay = new PaperOverlay({ ui: ctx.ui, input: ctx.input });
  const cinematic = new IntegrationCinematic({
    ctx, world, camera, player, assembly, collision, interaction, objectives, huds: [peek, top, bottom], layout,
  });
  const fans=[];
  world.scene.traverse((o)=>{if(o.name.startsWith('vent_fan_'))fans.push(o);});
  const s = { world, camera, collision, player, fans, interaction, peek, top, bottom, hint, objectives, assembly, overlay, cinematic, consoleDoc: null, consoleTab: null };

  interaction.register({
    object: world.stations.console, kind: 'station', id: 'console', label: '', verb: 'Open Mission Console',
    reach: layout.REACH.station, outlineWidth: 0.025, onInteract: () => openConsole(ctx, s),
  });
  interaction.register({
    object: world.stations.launch_ctl, kind: 'station', id: 'launch_ctl', label: '', verb: 'Open Launch Control',
    reach: layout.REACH.station, outlineWidth: 0.025,
    prompt: () => (ctx.state.integrated
      ? { key: 'E', verb: 'Open Launch Control', label: '' }
      : { key: null, verb: 'Integrate the payload first', label: '', tone: 'bad' }),
    onInteract: () => (ctx.state.integrated ? openLaunchControl(ctx, s) : ctx.ui.sfx('error')),
  });
  return s;
}

// ------------------------------------------------------------------ the two desks

/** Tab the console opens on: the brief the first time, then where the player left off, or the next step. */
function consoleStartTab(ctx, s) {
  if (!s.consoleTab) return 'brief';
  if (ctx.state.integrated) return 'integrate';
  const complete = verdictOf(ctx).checks.every((c) => !c.id.startsWith('missing_'));
  return complete && s.consoleTab === 'brief' ? 'readiness' : s.consoleTab;
}

/** Readiness verdict of the current build. */
const verdictOf = (ctx) => evaluateAssembly(ctx.state.assembly, ctx.state.mission);

function openConsole(ctx, s, tab = null) {
  if (s.overlay.isOpen || s.cinematic.active) return;
  s.assembly.settle();
  s.interaction.clear();
  if (!s.objectives.reached) {
    s.objectives.walkDone(); // opening the console counts as having walked to it
    ctx.ui.sfx('confirm');
  }
  const doc = missionConsole(
    { mission: ctx.state.mission, getAssembly: () => ctx.state.assembly, isIntegrated: () => ctx.state.integrated },
    {
      onBack: () => s.overlay.close(),
      onIntegrate: () => beginIntegration(ctx, s),
      onTab: (id) => id !== 'brief' && s.objectives.checkDone(), // looking at the check (or beyond) is running it
    },
  );
  doc.setTab(tab ?? consoleStartTab(ctx, s));
  s.consoleDoc = doc;
  s.overlay.open(doc.card, {
    onKey: (e) => {
      const id = TAB_KEYS[e.code];
      if (id) doc.setTab(id);
      return !!id;
    },
    onClose: () => {
      s.consoleTab = doc.tab;
      s.consoleDoc = null;
      s.interaction.refresh();
    },
  });
}

function openLaunchControl(ctx, s) {
  if (s.overlay.isOpen || s.cinematic.active || !ctx.state.integrated) return;
  s.interaction.clear();
  const card = launchControlCard(ctx.state.assembly, ctx.state.mission, {
    onBack: () => s.overlay.close(),
    onBegin: () => startLaunch(ctx, s),
  });
  s.overlay.open(card, { onClose: () => s.interaction.refresh() });
}

/** Button handler of the console: close it and play the cinematic. Returns when the payload is on the rocket. */
function beginIntegration(ctx, s) {
  if (!verdictOf(ctx).canIntegrate || ctx.state.integrated) return Promise.resolve(false);
  s.overlay.close(); // the click that got us here gives the mouse back
  return s.cinematic.start();
}

function startLaunch(ctx, s) {
  if (!ctx.state.integrated) return Promise.resolve(false);
  s.overlay.close({ relock: false });
  return ctx.scenes.goto('launch', { assembly: ctx.state.assembly });
}

/** Toast that sums up the flight a redesign follows. */
function lastResultToast(ctx, s) {
  const r = ctx.state.lastResult;
  if (!r) return;
  const stars = typeof r.stars === 'number' ? ` · ${r.stars} of 3 stars` : '';
  const detail = r.deliveredMB !== undefined && r.goalMB ? `${fmtMB(r.deliveredMB)} delivered of ${fmtMB(r.goalMB)}` : '';
  s.assembly.toast(`Last flight: ${r.success ? 'mission success' : 'mission failed'}${stars}`, { kind: r.success ? 'ok' : 'warn', detail, ms: 7000 });
}

function aimPoint(s, id) {
  const entry = s.interaction.entries.get(id);
  if (entry) return centreOf(entry);
  const rack = layout.RACKS.find((r) => r.id === id);
  if (rack) return new THREE.Vector3(rack.x, 1.1, rack.z);
  const fixed = {
    stand: [layout.STAND.x, 0.9, layout.STAND.z],
    satellite: [layout.STAND.x, 1.8, layout.STAND.z],
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
  const a = s.assembly;
  api.assembly = {
    get: () => a.get(),
    pick: (partId, options) => a.pick(partId, options),
    install: (options) => a.install(options),
    remove: (category, options) => a.remove(category, options),
    putBack: (options) => a.putBack(options),
    autoAssemble: (source, options) => a.autoAssemble(source, options),
    settle: () => a.settle(),
    setTimeScale: (scale) => { a.timeScale = scale; },
    instance: a,
    selfTest: () => runAssemblySelfTest(a, api, ctx),
  };
  api.console = {
    open: (tab) => openConsole(ctx, s, tab),
    close: () => s.overlay.close({ relock: false }),
    get tab() { return s.consoleDoc?.tab ?? null; },
    get confirming() { return s.consoleDoc?.confirming ?? false; },
    get isOpen() { return !!s.consoleDoc; },
    setTab: (tab) => s.consoleDoc?.setTab(tab),
  };
  api.launchControl = {
    open: () => openLaunchControl(ctx, s),
    close: () => s.overlay.close({ relock: false }),
    get isOpen() { return s.overlay.isOpen && !s.consoleDoc; },
  };
  const c = s.cinematic;
  /** Play the integration (refused while the build has blockers); skip: jump to the end at once; hold: start paused at t = 0 (then seek / resume). */
  api.integrate = ({ skip = false, hold = false } = {}) => {
    if (!verdictOf(ctx).canIntegrate) return Promise.resolve(false);
    if (s.overlay.isOpen) s.overlay.close({ relock: false });
    const done = c.start({ hold });
    if (skip) c.completeNow();
    return done;
  };
  api.integration = {
    get: () => c.get(),
    seek: (t) => c.seek(t),
    pause: () => { c.paused = true; },
    resume: () => { c.paused = false; },
    setSpeed: (x) => { c.speed = x; },
    skip: () => c.skip(),
  };
  api.launch = () => startLaunch(ctx, s);
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
  preload: prepareDetailModels,
  look: true,

  /** Esc opens the pause menu, except while a document or the cinematic has the screen (they use Esc themselves). */
  get pausable() {
    return !session || !(session.s.overlay.isOpen || session.s.cinematic.active);
  },

  /** Controls reminder shown in the pause menu. */
  pauseHelp: buildHelp,

  /** params.redesign: back from the debrief - the previous design is on the stand again, not integrated. */
  async enter(ctx, params = {}) {
    try {
      await document.fonts?.load('600 40px Inter'); // the sign textures are drawn on a canvas
    } catch {
      /* fallback fonts are fine */
    }
    const s = createScene(ctx);
    session = { ctx, s, elapsed: 0, moved: false, interacted: false, footsteps: { count: 0, last: null } };
    s.player.onFootstep = ({ surface, running, weight = 0 }) => {
      session.footsteps = { count: session.footsteps.count + 1, last: { surface, running } };
      const name = `step.${surface}`;
      if (ctx.audio.buffers.has(name)) {
        ctx.audio.play(name, { bus: 'sfx', volume: (running ? 0.7 : 0.5) * (1 + 0.5 * weight), rate: (0.94 + Math.random() * 0.12) * (1 - 0.12 * weight) });
      }
    };
    s.player.teleport(layout.SPAWN.x, layout.SPAWN.z, layout.SPAWN.yawDeg, layout.SPAWN.pitchDeg);
    ctx.renderer.setView(s.world.scene, s.camera);

    // The current design (from ?assembly=<preset> or a redesign) goes on the stand at once; refused parts are reported.
    const { refused } = await s.assembly.autoAssemble(ctx.state.assembly);
    setTimeout(() => {
      if (session?.s !== s) return;
      for (const r of refused) {
        s.assembly.toast(`${getPart(r.partId).shortName} was left on its rack`, { kind: 'warn', detail: r.reason, ms: 5200 });
      }
    }, REFUSED_TOAST_DELAY_MS);

    // ?integrated=1 starts after integration (once, and only for a build that may be integrated).
    const startIntegrated = !params.redesign && ctx.state.params.integrated
      && verdictOf(ctx).canIntegrate;
    ctx.state.params.integrated = false;
    ctx.state.integrated = false;
    if (startIntegrated) {
      s.cinematic.settleIntegrated();
    } else {
      s.cinematic.rest();
      if (params.redesign) {
        s.objectives.setStage('redesign');
        setTimeout(() => session?.s === s && lastResultToast(ctx, s), REFUSED_TOAST_DELAY_MS);
      }
    }

    const api = installDebugApi(ctx, s);
    if (ctx.state.params.selftest) setTimeout(() => api.selfTest(), 0);
    if (ctx.state.params.assemblytest) setTimeout(() => api.assembly.selfTest(), 0);
  },

  update(dt) {
    const { ctx, s } = session;
    for(const fan of s.fans) fan.rotation.x += dt * 0.8;
    if (s.cinematic.active || s.overlay.isOpen) {
      // The world keeps its animations; the player only coasts to a stop and cannot look around.
      ctx.input.consumeLook();
      if (s.overlay.isOpen) s.player.step(dt, {});
      s.assembly.update(dt);
      s.objectives.update(dt);
      s.cinematic.update(dt);
      return;
    }
    s.player.update(dt);
    s.assembly.update(dt);
    s.interaction.update(dt);
    if (ctx.input.pressed('KeyE') && s.interaction.interact()) session.interacted = true;
    if (ctx.input.pressed('KeyQ')) s.assembly.putBack();

    session.elapsed += dt;
    if (!session.moved && s.player.speed > 0.5) session.moved = true;
    if (s.hint.isConnected && ((session.moved && session.interacted) || session.elapsed > HINT_MAX_SECONDS)) leave(s.hint);

    const c = layout.CONSOLE;
    if (Math.hypot(s.player.pos.x - c.x, s.player.pos.z - c.z) < CONSOLE_REACHED_M && !s.objectives.reached) {
      s.objectives.walkDone();
      ctx.ui.sfx('confirm');
    }
    s.objectives.update(dt);
  },

  exit() {
    const { s } = session;
    delete window.__fl.hangar;
    delete window.__fl.player;
    delete window.__fl.interact;
    s.cinematic.dispose();
    s.overlay.dispose();
    s.assembly.dispose();
    s.interaction.dispose();
    s.peek.remove();
    s.top.remove();
    s.bottom.remove();
    disposeObject3D(s.world.scene);
    session = null;
  },
};
