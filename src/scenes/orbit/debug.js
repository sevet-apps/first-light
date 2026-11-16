// window.__fl.orbit: automation hooks for the orbit scene (see docs/DESIGN.md section 4).
import { policies, runPolicy } from '../../sim/policies.js';

const policyNamed = (name) => {
  const policy = policies[name];
  if (!policy) throw new Error(`Unknown policy "${name}" (${Object.keys(policies).join(', ')})`);
  return policy;
};

/** Fly with a policy until the simulation clock reaches `minutes` (or the end). */
function flyUntil(sim, policy, minutes) {
  while (!sim.state.done && sim.state.t < minutes - 1e-9) {
    sim.setMode(policy(sim.state, sim));
    sim.step(Math.min(0.25, minutes - sim.state.t));
  }
}

/**
 * @param {object} s orbit session
 * @param {{ begin: Function, setMode: Function, stepWarp: Function }} actions
 */
export function installOrbitDebug(s, actions) {
  const { sim, clock } = s;
  /** Every window in time order: [{ index, type, name, start, end }]. */
  const events = () => [
    ...sim.schedule.targets.map((w) => ({ ...w, type: 'target' })),
    ...sim.schedule.passes.map((w) => ({ ...w, type: 'pass' })),
    ...sim.schedule.eclipses.map((w) => ({ ...w, type: 'eclipse', name: 'Eclipse' })),
  ].sort((a, b) => a.start - b.start || a.type.localeCompare(b.type)).map((e, index) => ({ index, ...e }));

  window.__fl.orbit = {
    sim,
    clock,
    world: s.world,
    /** Camera rig: set distance / azimuth / elevation (radians) to frame a shot. */
    camera: s.rig,
    events,
    get state() { return sim.state; },
    /** Close the guidance card and start the simulation. */
    begin: actions.begin,
    setMode: (mode) => actions.setMode(mode),
    warp: (n) => clock.setWarp(n),
    /** Fly with a policy (default smart) to `leadMinutes` before the start of event `index` (see events()). */
    skipTo(index, policyName = 'smart', leadMinutes = 1) {
      const event = events()[index];
      if (!event) throw new Error(`No event ${index}`);
      flyUntil(sim, policyNamed(policyName), event.start - leadMinutes);
      return sim.state;
    },
    /** Fly the rest of the mission instantly with a policy (default smart); the scene then goes to the debrief. */
    finish(policyName = 'smart') {
      actions.begin();
      runPolicy(sim, policyNamed(policyName));
      return sim.result();
    },
  };
}
