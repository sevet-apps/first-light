// The integration cinematic as data: where the satellite, the crane hook, the payload and the fairing halves are
// at every moment, which camera shot is on, and which sounds play. `createChoreography` turns it into a pure
// function of time, so the Blender models and the real crane only have to follow the numbers it returns.
//
// Story: A a hook closes on the satellite and lifts it off the stand - B it flies across the clean room and lowers
// onto the payload adapter - C the fairing halves close around it - D the crane lifts the encapsulated payload up
// the whole height of the rocket - E it traverses over the rocket and mates on top.
import { layout } from './layout.js';

const { STAND: S, ENCAP: E, ROCKET: R, PAYLOAD: P, CRANE: C } = layout;

export const DURATION = 14.9;
export const SKIP_AFTER = 1.0; // Space / Esc work after this many seconds

// Key moments (seconds).
const T = {
  clampSatellite: 0.7, // hook closes on the satellite
  liftOff: 0.8,
  carried: 2.0, // lifted clear of the racks, shot A ends
  across: 4.2,
  seated: 5.0, // satellite rests on the adapter, the hook lets go
  hookClear: 5.8,
  fairingStart: 5.3,
  fairingClosed: 6.7,
  hookDown: 7.0, // hook settles on the payload's lifting collar
  slack: 7.4,
  risen: 11.2, // payload at the top of its climb beside the rocket
  overRocket: 12.6,
  mated: 13.9,
  released: 14.0,
};

const CARRY_Y = 4.0; // satellite base while it crosses the hall (clear of racks and glass)
const CLEAR_Y = R.payloadY + 1.4; // payload base while it passes over the rocket top
const CLIMB = { x: R.x + 6.5, z: R.z }; // vertical corridor beside the boosters
const HOOK_PARK_Y = 10.5; // hook waiting above the closing fairing
const HOOK_DROP = 5.0; // metres above its lifting point the hook starts from
const PAYLOAD_REST = [E.x, E.padY, E.z]; // payload origin (underside of the adapter ring) on the encapsulation cell

/** Camera shots. pos / look are keyed from -> to over the shot; look is a fixed point `at` or follows a `track`. */
export const SHOTS = [
  { id: 'lift', t0: 0, t1: T.carried, fov: 54, ease: 'inOut',
    from: { pos: [S.x - 3.4, 1.3, S.z + 4.6], look: { track: 'satellite', offset: [0, 1.9, 0] } },
    to: { pos: [S.x - 4.2, 2.8, S.z + 5.6], look: { track: 'satellite', offset: [0, 1.6, 0] } } },
  { id: 'travel', t0: T.carried, t1: T.seated, fov: 58, ease: 'inOut',
    from: { pos: [E.x - 4.0, 1.7, E.z + 8.0], look: { track: 'satellite', offset: [0, 1.0, 0] } },
    to: { pos: [E.x - 3.0, 1.9, E.z + 5.5], look: { track: 'satellite', offset: [0, 1.0, 0] } } },
  { id: 'fairing', t0: T.seated, t1: T.hookDown, fov: 56, ease: 'inOut',
    from: { pos: [E.x + 3.2, 1.9, E.z + 9.2], look: { at: [E.x, 2.9, E.z] } },
    to: { pos: [E.x - 2.2, 2.6, E.z + 8.2], look: { at: [E.x, 2.9, E.z] } } },
  { id: 'climb', t0: T.hookDown, t1: T.risen, fov: 60, ease: 'smooth',
    from: { pos: [13.8, 0.55, -8.2], look: { track: 'payload', offset: [0, 1.5, 0] } },
    to: { pos: [23.5, 0.6, 5.0], look: { track: 'payload', offset: [0, 4.0, 0] } } },
  { id: 'mate', t0: T.risen, t1: DURATION, fov: 42, ease: 'inOut',
    from: { pos: [R.x - 10, R.payloadY + 4.5, R.z + 9], look: { track: 'payload', offset: [0, 0.6, 0] } },
    to: { pos: [R.x - 8, R.payloadY + 2.5, R.z + 7.5], look: { track: 'payload', offset: [0, 0.8, 0] } } },
];

/** Sound hooks and small camera shakes, fired once when the clock passes `t`. */
export const EVENTS = [
  { t: T.clampSatellite, sound: 'clamp', shake: 0.01 },
  { t: T.liftOff, sound: 'crane_motor' },
  { t: T.seated, sound: 'clamp', shake: 0.012 },
  { t: T.fairingStart, sound: 'fairing_close' },
  { t: T.fairingClosed + 0.1, sound: 'clamp', shake: 0.02 },
  { t: T.hookDown, sound: 'clamp', shake: 0.01 },
  { t: T.slack, sound: 'crane_motor' },
  { t: T.mated, sound: 'clamp', shake: 0.04 },
];

const EASE = {
  linear: (x) => x,
  out: (x) => 1 - (1 - x) ** 2,
  inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2),
  smooth: (x) => x * x * (3 - 2 * x),
};

const lerp = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : a + (b - a) * k);
const add = (a, b) => a.map((v, i) => v + b[i]);

/** Value of a key track at time t. Keys: [{ t, v, e? }]; e eases the segment that ends at this key. */
export function keyed(keys, t) {
  if (t <= keys[0].t) return lerp(keys[0].v, keys[0].v, 0);
  for (let i = 1; i < keys.length; i++) {
    if (t > keys[i].t) continue;
    const a = keys[i - 1];
    const b = keys[i];
    return lerp(a.v, b.v, EASE[b.e ?? 'linear']((t - a.t) / (b.t - a.t)));
  }
  const last = keys.at(-1).v;
  return lerp(last, last, 0);
}

/**
 * @param {{ satelliteTop: number }} params height of the satellite above its base (sets how low the hook hangs)
 * @returns {{ duration: number, sample(t: number): object }}
 *   sample(t) -> { t, shot, cargo: 'satellite' | 'payload' | null, hook, satellite, payload, fairing, camera: { pos, look, fov } }
 *   Positions are world metres [x, y, z]: satellite = its base, payload = underside of the adapter ring,
 *   hook = lowest point of the hook block. fairing = 0 (open) .. 1 (closed).
 */
export function createChoreography({ satelliteTop }) {
  const satHang = satelliteTop + P.satelliteHang;
  const standBase = [S.x, S.topY, S.z];
  const adapterBase = [E.x, E.padY + P.ringH, E.z];

  const satellite = [
    { t: 0, v: standBase },
    { t: T.liftOff, v: standBase },
    { t: T.carried, v: [S.x, CARRY_Y, S.z], e: 'smooth' },
    { t: T.across, v: [E.x, CARRY_Y, E.z], e: 'smooth' },
    { t: T.seated, v: adapterBase, e: 'smooth' },
  ];
  const payload = [
    { t: T.hookDown, v: PAYLOAD_REST },
    { t: T.slack, v: add(PAYLOAD_REST, [0, 0.5, 0]), e: 'out' },
    { t: T.risen, v: [CLIMB.x, CLEAR_Y, CLIMB.z], e: 'smooth' },
    { t: T.overRocket, v: [R.x, CLEAR_Y, R.z], e: 'inOut' },
    { t: T.mated, v: [R.x, R.payloadY, R.z], e: 'inOut' },
  ];
  const freeHook = [ // between letting go of the satellite and taking the payload
    { t: T.seated, v: add(adapterBase, [0, satHang, 0]) },
    { t: T.hookClear, v: [E.x, HOOK_PARK_Y, E.z], e: 'inOut' },
    { t: T.hookDown - 0.9, v: [E.x, HOOK_PARK_Y, E.z] }, // starts down while the halves finish closing
    { t: T.hookDown, v: add(PAYLOAD_REST, [0, P.hang, 0]), e: 'inOut' },
  ];
  const hookAway = [ // after the payload is mated
    { t: T.released, v: [R.x, R.payloadY + P.hang, R.z] },
    { t: DURATION, v: [R.x, C.hookMaxY, R.z], e: 'inOut' },
  ];
  const fairing = [{ t: T.fairingStart, v: 0 }, { t: T.fairingClosed, v: 1, e: 'inOut' }];

  const hookAt = (t) => {
    if (t < T.clampSatellite) { // descends onto the satellite
      const above = (1 - EASE.inOut(t / T.clampSatellite)) * HOOK_DROP;
      return add(add(standBase, [0, satHang, 0]), [0, above, 0]);
    }
    if (t < T.seated) return add(keyed(satellite, t), [0, satHang, 0]);
    if (t < T.hookDown) return keyed(freeHook, t);
    if (t < T.released) return add(keyed(payload, t), [0, P.hang, 0]);
    return keyed(hookAway, t);
  };
  const cargoAt = (t) => {
    if (t >= T.clampSatellite && t < T.seated) return 'satellite';
    return t >= T.hookDown && t < T.released ? 'payload' : null;
  };
  const payloadAt = (t) => keyed(payload, t);
  const satelliteAt = (t) => (t < T.seated ? keyed(satellite, t) : add(payloadAt(t), [0, P.ringH, 0]));

  const lookAt = (look, at) => {
    if (look.at) return look.at;
    return add(at[look.track], look.offset ?? [0, 0, 0]);
  };
  const cameraAt = (t, at) => {
    const shot = SHOTS.find((s) => t < s.t1) ?? SHOTS.at(-1);
    const k = EASE[shot.ease](Math.min(1, Math.max(0, (t - shot.t0) / (shot.t1 - shot.t0))));
    return {
      shot: shot.id,
      pos: lerp(shot.from.pos, shot.to.pos, k),
      look: lerp(lookAt(shot.from.look, at), lookAt(shot.to.look, at), k),
      fov: shot.fov,
    };
  };

  return {
    duration: DURATION,
    sample(t) {
      const time = Math.min(DURATION, Math.max(0, t));
      const at = { satellite: satelliteAt(time), payload: payloadAt(time), hook: hookAt(time) };
      const camera = cameraAt(time, at);
      return { t: time, shot: camera.shot, cargo: cargoAt(time), ...at, fairing: keyed(fairing, time), camera };
    },
  };
}
