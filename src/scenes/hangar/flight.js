// Motion primitives for the assembly animations: a small timeline (timed events plus a per-frame update) and a
// flight that carries the nodes of one part from a start pose to an end pose along an arc.
import * as THREE from 'three';
import { Pose } from '../shared/satellite.js';

export const clamp01 = (x) => THREE.MathUtils.clamp(x, 0, 1);
export const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2);
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Runs for `duration` seconds. `at(time, fn)` fires once when the clock passes `time`; `update(t)` is called every
 * step after the events and must be a pure function of t. finish() jumps to the end, firing every event in order.
 */
export class Timeline {
  constructor(duration) {
    this.duration = duration;
    this.t = 0;
    this.events = [];
    this.update = null;
    this.onDone = null;
    this.done = false;
  }

  at(time, fn) {
    this.events.push({ time, fn, fired: false });
    return this;
  }

  /** Advance by dt; returns true once finished. */
  step(dt) {
    if (this.done) return true;
    this.t = Math.min(this.duration, this.t + dt);
    for (const e of this.events) {
      if (!e.fired && e.time <= this.t) {
        e.fired = true;
        e.fn();
      }
    }
    this.update?.(this.t);
    if (this.t >= this.duration) {
      this.done = true;
      this.onDone?.();
    }
    return this.done;
  }

  finish() {
    return this.step(Infinity);
  }
}

/**
 * One part's nodes flying between two poses (world space). starts[i] / ends()[i] belong to mount i; from[i] and
 * to[i] are the nodes drawn at the start and at the end (different nodes when a mount morphs, like body cells).
 * The path is eased, lifted along `arc` (metres, world) and the node pairs cross-scale: `from` shrinks away while
 * `to` grows in, early on install ('in') or late on removal ('out').
 */
export class Flight {
  constructor({ starts, ends, from, to, arc = [0, 0.2, 0], morph = 'in' }) {
    this.starts = starts;
    this.ends = ends;
    this.from = from;
    this.to = to;
    this.arc = new THREE.Vector3(...arc);
    this.morph = morph;
  }

  /** k: linear progress 0..1. */
  apply(k) {
    const e = easeInOut(clamp01(k));
    const ends = this.ends();
    const m = this.morph === 'in' ? smooth(0, 0.4, k) : smooth(0.6, 1, k);
    this.starts.forEach((start, i) => {
      const pose = new Pose().blend(start, ends[i], e);
      pose.position.addScaledVector(this.arc, Math.sin(Math.PI * e));
      const [a, b] = [this.from[i], this.to[i]];
      if (a === b) {
        pose.applyTo(a);
        return;
      }
      pose.applyTo(a);
      a.scale.multiplyScalar(1 - m);
      a.visible = 1 - m > 0.002;
      pose.applyTo(b);
      b.scale.multiplyScalar(m);
      b.visible = m > 0.002;
    });
  }
}
