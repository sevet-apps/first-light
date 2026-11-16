// Orbit operations: the player flies LUMEN-1 for three orbits by choosing SUN / IMAGE / DOWNLINK, then the debrief.
import { disposeObject3D } from '../../core/sceneManager.js';
import { fmt } from '../../data/format.js';
import { presets } from '../../data/presets.js';
import { createOrbitSim } from '../../sim/orbit.js';
import { CATEGORIES } from '../../data/components.js';
import { CameraRig } from './cameraRig.js';
import { OrbitClock, WARPS } from './clock.js';
import { installOrbitDebug } from './debug.js';
import { createOrbitHud } from './hud.js';
import { createOrbitWorld } from './world.js';
import { prepareDetailModels } from '../shared/detailModels.js';
import { prepareEarth } from '../shared/earth.js';

const MODE_KEYS = { Digit1: 'SUN', Digit2: 'IMAGE', Digit3: 'DOWNLINK', Numpad1: 'SUN', Numpad2: 'IMAGE', Numpad3: 'DOWNLINK' };
const END_PAUSE_SECONDS = 2.8; // "Mission complete" stays up this long before the debrief
const BLOOM = { strength: 0.2, radius: 0.5, threshold: 1.05 };

let guidanceSeen = false; // the three-modes card is shown once per session
let session = null;

/** Toasts for what the simulation just logged. */
function announce(ctx, entry, state) {
  const { ui } = ctx;
  switch (entry.type) {
    case 'safe_mode':
      ui.toast('Safe mode: battery empty', { kind: 'error', ms: 6000, detail: `All systems off and controls locked for ${ctx.state.mission.ops.safeModeMinutes} minutes.` });
      break;
    case 'memory_full':
      ui.toast('Memory full', { kind: 'warn', ms: 5000, detail: 'New imagery is being thrown away. Downlink to make room.' });
      break;
    case 'battery_low':
      ui.toast(`Battery low: ${Math.round(entry.batteryPct)} %`, { kind: 'warn', ms: 5000, detail: 'Switch to SUN-POINT before it runs flat.' });
      break;
    case 'eclipse_enter':
      ui.toast('Entering Earth\'s shadow', { ms: 4200, detail: 'No solar power until the light returns.' });
      break;
    case 'eclipse_exit':
      ui.toast('Sunlight again', { kind: 'ok', ms: 3200, detail: `Battery ${Math.round(state.batteryPct)} %.` });
      break;
    default:
  }
}

function createSession(ctx, params) {
  const { state } = ctx;
  if (CATEGORIES.some((c) => !params.assembly?.[c])) {
    if (CATEGORIES.some((c) => !state.assembly[c])) state.assembly = { ...presets.balanced };
  } else state.assembly = { ...params.assembly };
  const mission = state.mission;
  const sim = createOrbitSim(state.assembly, mission);

  const rig = new CameraRig(ctx.renderer.canvas);
  const s = { ctx, sim, rig, mission, started: false, logSeen: 0, lastMode: 'SUN', ending: 0, leaving: false, seconds: 0 };
  s.exploring = false;
  s.hudElapsed = 1;
  s.clock = new OrbitClock(sim, mission.orbit.realSecondsPerOrbit, mission.orbit.orbitMinutes);
  s.clock.warp = state.params.warp > 1 ? state.params.warp : 1;
  s.hud = createOrbitHud(ctx, {
    mission,
    onMode: (mode) => setMode(s, mode),
    onWarp: (warp) => s.clock.setWarp(warp),
    onView: () => changeView(s),
    onExplore: () => explore(s),
  });
  s.world = createOrbitWorld({ assembly: state.assembly, mission, schedule: sim.schedule, labelLayer: s.hud.labelLayer });
  s.clock.onWarpDrop = (event) => {
    ctx.ui.toast('Warp back to 1×', { ms: 3600, detail: `${event.type === 'target' ? 'Imaging window' : 'Ground pass'} ${event.name} opens in about 5 seconds.` });
  };
  return s;
}

/** Player (or debug) mode change; refused with a cue while the spacecraft is in safe mode. */
function setMode(s, mode) {
  if (s.hud.guideOpen || s.ending) return false;
  if (s.sim.state.mode === 'SAFE') {
    s.ctx.ui.sfx('error');
    s.ctx.ui.toast('Controls locked', { kind: 'warn', ms: 2400, detail: `Safe mode ends in ${Math.ceil(s.sim.state.safeModeRemaining)} min.` });
    return false;
  }
  s.sim.setMode(mode);
  s.hud.setMode(mode);
  return true;
}

function stepWarp(s, direction) {
  const index = WARPS.indexOf(s.clock.warp);
  s.clock.setWarp(WARPS[Math.min(WARPS.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction))]);
}

function begin(s) {
  s.hud.closeGuidance();
  s.started = true;
}

function changeView(s) {
  s.rig.setView(s.rig.view === 'earth' ? 'satellite' : 'earth', s.world.sunDirection);
  s.hud.setView(s.rig.view);
}

function explore(s) {
  s.exploring = !s.exploring;
  s.hud.setExploring(s.exploring);
}

export default {
  id: 'orbit',
  preload: (ctx) => Promise.all([prepareDetailModels(ctx), prepareEarth(ctx)]),
  pausable: true,

  /** params.assembly: the integrated build (falls back to the current one, then to a balanced preset). */
  async enter(ctx, params = {}) {
    session = createSession(ctx, params);
    const s = session;
    ctx.renderer.setView(s.world.scene, s.rig.camera, { bloom: BLOOM });
    await s.world.prewarmEffects(ctx.renderer.gl,s.rig.camera);
    if (guidanceSeen || !ctx.state.params.guide) begin(s);
    else {
      guidanceSeen = true;
      s.hud.showGuidance(() => begin(s));
    }
    installOrbitDebug(s, { begin: () => begin(s), setMode: (mode) => setMode(s, mode), stepWarp: (d) => stepWarp(s, d),
      setView: (view) => { s.rig.setView(view, s.world.sunDirection); s.hud.setView(s.rig.view); },
      explore: (value) => { s.exploring = value; s.hud.setExploring(value); },
    });
  },

  update(dt) {
    const s = session;
    const { ctx, sim } = s;
    s.seconds += dt;
    const paused = !s.started || ctx.menus.mode !== null;
    s.clock.paused = paused || s.exploring || !!s.ending;

    if (!paused && !s.ending) {
      if (ctx.input.pressed('KeyV')) changeView(s);
      if (ctx.input.pressed('KeyP')) explore(s);
      if (ctx.input.pressed('KeyH')) s.hud.toggleHud();
      for (const [code, mode] of Object.entries(MODE_KEYS)) if (ctx.input.pressed(code)) setMode(s, mode);
      if (ctx.input.pressed('BracketLeft')) stepWarp(s, -1);
      if (ctx.input.pressed('BracketRight')) stepWarp(s, 1);
    }
    s.clock.advance(dt);

    const state = sim.state;
    for (; s.logSeen < sim.log.length; s.logSeen++) announce(ctx, sim.log[s.logSeen], state);
    if (s.lastMode === 'SAFE' && state.mode !== 'SAFE' && !state.done) {
      ctx.ui.toast('Safe mode ended', { kind: 'ok', ms: 3600, detail: 'Systems restored in SUN-POINT.' });
    }
    s.lastMode = state.mode;

    s.rig.update(dt, { x: 0, y: 0, z: 0 }, s.world.geo.earthCentre);
    s.world.update(state, dt, s.seconds, s.rig.camera);
    const eclipse = sim.schedule.eclipses.find((e) => state.t >= e.start && state.t < e.end);
    s.hudElapsed += dt;
    if (s.hudElapsed >= 0.1) {
      s.hudElapsed = 0;
      s.hud.update(state, sim.upcoming(4), s.clock.effectiveWarp, {
        note: s.ending ? 'Mission complete. Preparing the debrief.' : s.exploring ? 'Time paused · P to resume' : null,
        eclipseEndsIn: eclipse ? eclipse.end - state.t : null,
        focus: s.clock.focus,
      });
    }

    if (state.done && !s.ending) finishMission(s);
    if (s.ending) {
      s.ending += dt;
      if (s.ending > END_PAUSE_SECONDS && !s.leaving) {
        s.leaving = true;
        ctx.scenes.goto('debrief', { result: ctx.state.lastResult }).then((ok) => { s.leaving = ok; });
      }
    }
  },

  exit() {
    const s = session;
    delete window.__fl.orbit;
    s.rig.dispose();
    s.hud.dispose();
    disposeObject3D(s.world.scene);
    session = null;
  },
};

/** Freeze at the end of the third orbit: store the result and head for the debrief. */
function finishMission(s) {
  const { ctx, sim } = s;
  s.ending = 0.001;
  ctx.state.lastResult = sim.result();
  ctx.ui.toast('Mission complete', { kind: 'ok', ms: 3400, detail: `${fmt(Math.round(sim.state.deliveredMB))} MB delivered of ${fmt(s.mission.goalMB)} MB.` });
  s.hud.closeGuidance();
}
