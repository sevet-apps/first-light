import { onSettingsChange } from './settings.js';

const BUS_NAMES = ['master', 'music', 'voice', 'sfx', 'ambience'];
const NO_HANDLE = { stop() {}, source: null };

/** WebAudio manager. The AudioContext is created on the first user gesture
 *  (browser autoplay policy); until then every call is a harmless no-op. */
export class AudioManager {
  constructor(settings, { debug = false } = {}) {
    this.settings = settings;
    this.debug = debug;
    this.ctx = null;
    this.buses = {}; // name -> { duck: GainNode (input), vol: GainNode }
    this.buffers = new Map();
    this.pending = new Map();
    this.unlockCallbacks = [];

    const unlock = () => this.unlock();
    for (const type of ['click', 'pointerup', 'keydown']) window.addEventListener(type, unlock, { capture: true });
    onSettingsChange((path) => path.startsWith('volumes.') && this.#applyVolumes());
  }

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  /** Create/resume the context. Must be called from a user gesture handler. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.#buildBuses();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.ctx.state === 'running') {
      for (const cb of this.unlockCallbacks.splice(0)) cb();
    }
  }

  /** Run `cb` once audio is available (immediately if already unlocked). */
  whenUnlocked(cb) {
    if (this.unlocked) cb();
    else this.unlockCallbacks.push(cb);
  }

  /** Fetch + decode a file into the cache under `name` (defaults to the url). Resolves null if unavailable. */
  load(url, name = url) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (!this.ctx) return Promise.resolve(null);
    if (!this.pending.has(name)) {
      const job = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => { this.buffers.set(name, buffer); return buffer; })
        .catch((err) => { this.#warn(`audio "${url}" unavailable: ${err.message}`); return null; })
        .finally(() => this.pending.delete(name));
      this.pending.set(name, job);
    }
    return this.pending.get(name);
  }

  /** Play a cached name or an AudioBuffer. Returns a handle with stop(fadeSec). */
  play(source, { bus = 'sfx', volume = 1, loop = false, rate = 1, position = null } = {}) {
    const buffer = typeof source === 'string' ? this.buffers.get(source) : source;
    if (!this.ctx || !buffer) {
      if (typeof source === 'string') this.#warn(`sound "${source}" not loaded`);
      return NO_HANDLE;
    }
    const ctx = this.ctx;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = loop;
    node.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    node.connect(gain);

    let panner = null;
    if (position) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      gain.connect(panner);
      panner.connect(this.buses[bus].duck);
    } else {
      gain.connect(this.buses[bus].duck);
    }
    node.onended = () => { node.disconnect(); gain.disconnect(); panner?.disconnect(); };
    node.start();

    return {
      source: node,
      panner,
      stop: (fadeSec = 0.05) => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fadeSec);
        try { node.stop(now + fadeSec + 0.02); } catch { /* already stopped */ }
      },
    };
  }

  /** Lower a bus by `dB` for `seconds`, then release (voice-over ducking). */
  duck(bus, dB, seconds) {
    if (!this.ctx) return;
    const g = this.buses[bus].duck.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(10 ** (-dB / 20), now, 0.05);
    g.setTargetAtTime(1, now + seconds, 0.3);
  }

  /** Update the 3D listener from a camera (call each frame while positional sounds play). */
  setListener(camera) {
    if (!this.ctx || !camera) return;
    const e = camera.matrixWorld.elements;
    const l = this.ctx.listener;
    // Firefox exposes the legacy setters instead of the AudioParam properties.
    if (l.positionX && l.positionY && l.positionZ) {
      l.positionX.value = e[12]; l.positionY.value = e[13]; l.positionZ.value = e[14];
    } else {
      l.setPosition?.(e[12], e[13], e[14]);
    }
    if (l.forwardX && l.forwardY && l.forwardZ && l.upX && l.upY && l.upZ) {
      l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
      l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
    } else {
      l.setOrientation?.(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  #buildBuses() {
    const ctx = this.ctx;
    for (const name of BUS_NAMES) {
      const duck = ctx.createGain();
      const vol = ctx.createGain();
      duck.connect(vol);
      this.buses[name] = { duck, vol };
    }
    for (const name of BUS_NAMES) {
      this.buses[name].vol.connect(name === 'master' ? ctx.destination : this.buses.master.duck);
    }
    this.#applyVolumes();
  }

  #applyVolumes() {
    if (!this.ctx) return;
    for (const name of BUS_NAMES) {
      this.buses[name].vol.gain.setTargetAtTime(this.settings.volumes[name], this.ctx.currentTime, 0.02);
    }
  }

  #warn(message) {
    if (this.debug) console.warn(`[audio] ${message}`);
  }
}
