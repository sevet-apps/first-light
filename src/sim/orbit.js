// Deterministic orbit-operations simulation: fixed-step integrator with a typed event log.
import { getPart } from '../data/components.js';
import { buildSchedule, inInterval } from './schedule.js';
import { analyzeMission } from './analysis.js';

export const MODES = ['SUN', 'IMAGE', 'DOWNLINK'];
const STEP = 0.25; // internal sim-minutes per tick, independent of the caller's dt
const EPS = 1e-9;
const BATTERY_LOW_PCT = 20;
const BATTERY_LOW_REARM_PCT = 30;
const MEMORY_FULL_REARM = 0.9;

/**
 * Create a simulation of one satellite flying the mission.
 * Modes: SUN (charge), IMAGE (collect over targets), DOWNLINK (transmit over passes), SAFE (forced, battery empty).
 */
export function createOrbitSim(assembly, mission, { seed = 1 } = {}) {
  const parts = {
    bus: getPart(assembly.bus), instrument: getPart(assembly.instrument), solar: getPart(assembly.solar),
    battery: getPart(assembly.battery), antenna: getPart(assembly.antenna),
  };
  if (Object.values(parts).some((p) => !p)) throw new Error('createOrbitSim needs a complete assembly');

  const { orbitMinutes } = mission.orbit;
  const { pointingSolarFraction, safeModeMinutes, startBatteryFraction } = mission.ops;
  const schedule = buildSchedule(mission, seed);
  const total = schedule.totalMinutes;
  const capacityWh = parts.battery.stats.capacityWh;
  const storageMB = parts.bus.stats.storageMB;
  const base = parts.bus.stats.baseLoadW;
  const solarW = parts.solar.stats.powerW;
  const imageRate = parts.instrument.stats.dataRateMBmin;
  const sendRate = parts.antenna.stats.rateMBmin;

  const s = {
    tick: 0, pending: 0, mode: 'SUN', batteryWh: capacityWh * startBatteryFraction, memoryMB: 0,
    deliveredMB: 0, dataLostMB: 0, safeRemaining: 0,
    sunlit: true, target: null, pass: null, powerIn: 0, powerOut: base,
    batteryLow: false, memoryFull: false, closed: false, safeEpisode: false,
    drain: null, // the latest IMAGE / DOWNLINK stretch: { mode, t, eclipse }, so a later safe mode can name what emptied the battery
  };
  const stats = {
    safeModeCount: 0, targetMinutes: 0, missedTargetMinutes: 0, passMinutes: 0, unusedPassMinutes: 0,
    idleImagingMinutes: 0, imagedMB: 0, minBatteryPct: 100, imagedInTargetMinutes: 0, downlinkMinutes: 0,
  };
  const log = [];

  const orbitAt = (t) => Math.min(mission.orbit.orbits - 1, Math.floor(t / orbitMinutes + EPS));
  const note = (type, t, extra = {}) => log.push({ t, orbit: orbitAt(t), type, ...extra });

  /** Compare the environment at time t with the previous tick and log the transitions. */
  function syncEnvironment(t) {
    const sunlit = !inInterval(schedule.eclipses, t);
    if (sunlit !== s.sunlit) note(sunlit ? 'eclipse_exit' : 'eclipse_enter', t);
    s.sunlit = sunlit;
    for (const [key, list, kind] of [['target', schedule.targets, 'target'], ['pass', schedule.passes, 'pass']]) {
      const now = inInterval(list, t);
      if (now?.id !== s[key]?.id) {
        if (s[key]) note(`${kind}_end`, t, { name: s[key].name, windowId: s[key].id });
        if (now) note(`${kind}_start`, t, { name: now.name, windowId: now.id });
      }
      s[key] = now;
    }
  }

  function enterSafeMode(t, modeBefore) {
    s.mode = 'SAFE';
    s.safeRemaining = safeModeMinutes;
    // Repeated lock-ups while the battery never recovers are one episode for scoring.
    const repeat = s.safeEpisode;
    s.safeEpisode = true;
    if (!repeat) stats.safeModeCount++;
    note('safe_mode', t, { repeat, modeBefore, drain: s.drain, eclipse: !s.sunlit, inTarget: !!s.target, inPass: !!s.pass, target: s.target?.name, pass: s.pass?.name });
  }

  function tick() {
    const t = s.tick * STEP;
    syncEnvironment(t);
    const mode = s.mode;
    if (mode === 'IMAGE' || mode === 'DOWNLINK') s.drain = { mode, t, eclipse: !s.sunlit };
    const solarFactor = !s.sunlit ? 0 : mode === 'IMAGE' || mode === 'DOWNLINK' ? pointingSolarFraction : 1;
    s.powerIn = solarW * solarFactor;
    s.powerOut = base + (mode === 'IMAGE' ? parts.instrument.stats.powerW : 0) + (mode === 'DOWNLINK' ? parts.antenna.stats.powerW : 0);

    if (s.target) {
      stats.targetMinutes += STEP;
      if (mode !== 'IMAGE') stats.missedTargetMinutes += STEP;
      else stats.imagedInTargetMinutes += STEP;
    }
    if (mode === 'IMAGE' && !s.target) stats.idleImagingMinutes += STEP;
    if (s.pass) {
      stats.passMinutes += STEP;
      if (mode !== 'DOWNLINK' && s.memoryMB > EPS) stats.unusedPassMinutes += STEP;
    }

    if (mode === 'IMAGE' && s.target) {
      const gathered = imageRate * STEP;
      const stored = Math.min(gathered, storageMB - s.memoryMB);
      s.memoryMB += stored;
      stats.imagedMB += stored;
      if (gathered - stored > EPS) {
        s.dataLostMB += gathered - stored;
        if (!s.memoryFull) note('memory_full', t, { target: s.target.name });
        s.memoryFull = true;
      }
    } else if (mode === 'DOWNLINK' && s.pass) {
      const sent = Math.min(s.memoryMB, sendRate * STEP);
      s.memoryMB -= sent;
      s.deliveredMB += sent;
      if (sent > EPS) stats.downlinkMinutes += STEP;
    }
    if (s.memoryFull && s.memoryMB < storageMB * MEMORY_FULL_REARM) s.memoryFull = false;

    s.batteryWh = Math.min(capacityWh, Math.max(0, s.batteryWh + ((s.powerIn - s.powerOut) * STEP) / 60));
    const pct = (s.batteryWh / capacityWh) * 100;
    stats.minBatteryPct = Math.min(stats.minBatteryPct, pct);
    s.tick++;
    const tNext = s.tick * STEP;

    if (!s.batteryLow && pct < BATTERY_LOW_PCT) {
      s.batteryLow = true;
      note('battery_low', tNext, { batteryPct: pct, mode });
    } else if (s.batteryLow && pct > BATTERY_LOW_REARM_PCT) s.batteryLow = false;
    if (pct > BATTERY_LOW_REARM_PCT) s.safeEpisode = false;

    if (mode === 'SAFE') {
      s.safeRemaining = Math.max(0, s.safeRemaining - STEP);
      if (s.safeRemaining < EPS) s.mode = 'SUN';
    } else if (s.batteryWh <= EPS) {
      enterSafeMode(tNext, mode);
    }
  }

  function finish() {
    if (s.closed) return;
    s.closed = true;
    syncEnvironment(total);
  }

  const sim = {
    schedule,
    log,
    parts,
    step(simMinutes) {
      s.pending += Math.max(0, simMinutes);
      while (s.pending >= STEP - EPS && s.tick * STEP < total - EPS) {
        tick();
        s.pending -= STEP;
      }
      if (s.tick * STEP >= total - EPS) {
        s.pending = 0;
        finish();
      }
    },
    setMode(mode) {
      if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}`);
      if (s.mode === 'SAFE') return;
      s.mode = mode;
    },
    get state() {
      const t = s.tick * STEP;
      const eclipse = schedule.eclipses.find((e) => e.end > t + EPS);
      return {
        t,
        orbit: orbitAt(t),
        sunlit: s.sunlit,
        mode: s.mode,
        batteryWh: s.batteryWh,
        batteryPct: (s.batteryWh / capacityWh) * 100,
        memoryMB: s.memoryMB,
        memoryPct: (s.memoryMB / storageMB) * 100,
        deliveredMB: s.deliveredMB,
        dataLostMB: s.dataLostMB,
        inTarget: !!s.target,
        inPass: !!s.pass,
        currentTarget: s.target,
        currentPass: s.pass,
        powerInW: s.powerIn,
        powerOutW: s.powerOut,
        safeModeRemaining: s.safeRemaining,
        timeToEclipseStart: !eclipse ? Infinity : Math.max(0, eclipse.start - t),
        done: t >= total - EPS,
      };
    },
    /** Next `n` events that have not started yet, soonest first, with minutes until they start. */
    upcoming(n = 3) {
      const t = s.tick * STEP;
      const events = [
        ...schedule.targets.map((w) => ({ ...w, type: 'target' })),
        ...schedule.passes.map((w) => ({ ...w, type: 'pass' })),
        ...schedule.eclipses.map((w) => ({ ...w, type: 'eclipse', name: 'Eclipse' })),
      ];
      return events
        .filter((e) => e.start > t + EPS)
        .sort((a, b) => a.start - b.start || a.type.localeCompare(b.type))
        .slice(0, n)
        .map((e) => ({ ...e, startsIn: e.start - t }));
    },
    result() {
      return analyzeMission({ parts, mission, stats, log, schedule, state: sim.state });
    },
  };
  return sim;
}
