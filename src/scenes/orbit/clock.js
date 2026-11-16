// Pacing of the simulation: real seconds -> simulated minutes, the 1x / 2x / 4x time warp, the automatic drop to 1x
// shortly before an imaging window or a ground pass opens, and focus time (half pace, no warp) while one is open.
// Pacing only: the simulation itself is stepped in simulated minutes, so results do not depend on any of this.

export const WARPS = [1, 2, 4];
const AUTO_DROP_REAL_SECONDS = 5; // at 1x, the player gets this long before a window opens
const WATCHED = ['target', 'pass'];
export const FOCUS_PACE = 0.5; // share of the 1x pace while a window is open

export class OrbitClock {
  /**
   * @param {object} sim createOrbitSim() result
   * @param {number} realSecondsPerOrbit wall-clock length of one orbit at 1x
   */
  constructor(sim, realSecondsPerOrbit, orbitMinutes) {
    this.sim = sim;
    this.minutesPerSecond = orbitMinutes / realSecondsPerOrbit;
    this.warp = 1;
    this.paused = true;
    this.onWarpDrop = null; // (event) => void
    this.resumeWarp = null; // warp to restore once the window that interrupted it is over
    this.wasFocus = false;
  }

  setWarp(value) {
    this.warp = value;
    this.resumeWarp = null;
  }

  /** True while a target window or ground pass is open: time slows to half pace and warp is suspended. */
  get focus() {
    const s = this.sim.state;
    return (s.inTarget || s.inPass) && !s.done;
  }

  /** Warp actually applied right now. */
  get effectiveWarp() {
    return this.focus ? 1 : this.warp;
  }

  /** Next target or pass that has not started yet (null at the end of the mission). */
  #nextWindow() {
    return this.sim.upcoming(8).find((e) => WATCHED.includes(e.type)) ?? null;
  }

  #dropWarp(event) {
    this.resumeWarp = this.warp;
    this.warp = 1;
    this.onWarpDrop?.(event);
  }

  /** Advance by `realSeconds` of wall-clock time. Returns the simulated minutes that passed. */
  advance(realSeconds) {
    if (this.paused || this.sim.state.done) return 0;
    let remaining = realSeconds;
    const before = this.sim.state.t;
    while (remaining > 1e-9 && !this.sim.state.done) {
      const focus = this.focus;
      if (this.wasFocus && !focus && this.resumeWarp) {
        this.warp = this.resumeWarp;
        this.resumeWarp = null;
      }
      this.wasFocus = focus;
      const rate = this.minutesPerSecond * (focus ? FOCUS_PACE : this.warp);
      let slice = remaining;
      let drop = null;
      const next = this.warp > 1 ? this.#nextWindow() : null;
      if (next) {
        const untilDrop = next.startsIn - AUTO_DROP_REAL_SECONDS * this.minutesPerSecond; // keeps 5 real seconds at 1x
        if (untilDrop <= 1e-9) {
          this.#dropWarp(next);
          continue;
        }
        if (untilDrop / rate < slice) {
          slice = untilDrop / rate;
          drop = next;
        }
      }
      this.sim.step(slice * rate);
      remaining -= slice;
      if (drop) this.#dropWarp(drop);
    }
    return this.sim.state.t - before;
  }
}
