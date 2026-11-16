// Pacing of the simulation: real seconds -> simulated minutes, the 1x / 2x / 4x time warp and the automatic
// drop to 1x shortly before an imaging window or a ground pass opens.

export const WARPS = [1, 2, 4];
const AUTO_DROP_REAL_SECONDS = 5; // at 1x, the player gets this long before a window opens
const WATCHED = ['target', 'pass'];

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
  }

  setWarp(value) {
    this.warp = value;
  }

  /** Next target or pass that has not started yet (null at the end of the mission). */
  #nextWindow() {
    return this.sim.upcoming(8).find((e) => WATCHED.includes(e.type)) ?? null;
  }

  #dropWarp(event) {
    this.warp = 1;
    this.onWarpDrop?.(event);
  }

  /** Advance by `realSeconds` of wall-clock time. Returns the simulated minutes that passed. */
  advance(realSeconds) {
    if (this.paused || this.sim.state.done) return 0;
    let remaining = realSeconds;
    const before = this.sim.state.t;
    while (remaining > 1e-9 && !this.sim.state.done) {
      const rate = this.minutesPerSecond * this.warp;
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
