// Result analysis: objectives, stars and plain-English causes derived from the event log and the assembly.
import { catalog } from '../data/components.js';
import { fmt, fmtMB } from '../data/format.js';
import { starsFor } from '../data/mission.js';
import { evaluateAssembly } from './assembly.js';

const MODE_ACTIVITY = { SUN: 'running only its base systems in SUN-POINT', IMAGE: 'imaging', DOWNLINK: 'downlinking', SAFE: 'in safe mode' };
const MODE_GERUND = { IMAGE: 'imaging', DOWNLINK: 'downlinking' };
const RECENT_DRAIN_MIN = 40; // an IMAGE / DOWNLINK stretch this recent (about one eclipse) still explains a safe mode in SUN-POINT

/** What the satellite was doing when the battery ran flat; in SUN-POINT it names the activity that drained it earlier. */
function activityBefore(event) {
  const { modeBefore, drain } = event;
  if (modeBefore !== 'SUN' || !drain || event.t - drain.t > RECENT_DRAIN_MIN) return MODE_ACTIVITY[modeBefore];
  return `running only its base systems after ${MODE_GERUND[drain.mode]}${drain.eclipse ? ' through the eclipse' : ''}`;
}

const UNUSED_PASS_NOTE_MIN = 12;
const SLOW_LINK_GOAL_RATIO = 2; // a link that can carry under 2x the goal over all passes counts as slow
const round1 = (n) => Math.round(n * 10) / 10;

/** Larger part of the same category that the installed bus accepts, cheapest first. */
function upgradeFor(part, stat, bus) {
  return catalog.byCategory[part.category]
    .filter((p) => p.stats[stat] > part.stats[stat])
    .filter((p) => {
      const allowed = bus.stats.allows[p.category];
      return (!allowed || allowed.includes(p.id)) && (!p.stats.requiresBus || p.stats.requiresBus.includes(bus.id));
    })
    .sort((a, b) => a.cost - b.cost)[0];
}

function buildObjectives(parts, mission, stats, deliveredMB) {
  const goal = mission.goalMB;
  const detailLimit = mission.objectives.find((o) => o.id === 'detail').maxResolutionM;
  const res = parts.instrument.stats.resolutionM;
  return [
    {
      id: 'primary', met: deliveredMB >= goal,
      text: `Deliver ${fmtMB(goal)} to the ground: ${fmtMB(deliveredMB)} delivered (${fmt((deliveredMB / goal) * 100)} %).`,
    },
    {
      id: 'resilient', met: stats.safeModeCount === 0,
      text: stats.safeModeCount === 0
        ? 'Resilient operations: no safe-mode events.'
        : `Resilient operations: ${stats.safeModeCount} safe-mode event${stats.safeModeCount > 1 ? 's' : ''}.`,
    },
    {
      id: 'detail', met: res <= detailLimit,
      text: `Fire-scale detail: ${res} m resolution (needs ${detailLimit} m or better).`,
    },
  ];
}

function safeModeReasons(parts, mission, stats, log) {
  const events = log.filter((e) => e.type === 'safe_mode' && !e.repeat);
  if (!events.length) return { reasons: [], suggestions: [] };
  const first = events[0];
  const { battery, solar, bus } = parts;
  const where = first.eclipse ? 'the eclipse' : 'sunlight';
  const doing = activityBefore(first);
  const reasons = [
    `Battery ran flat during ${where} of orbit ${first.orbit + 1} while ${doing} (${battery.shortName}, ${battery.stats.capacityWh} Wh). `
    + `Safe mode then shut everything down for ${mission.ops.safeModeMinutes} minutes`
    + (events.length > 1 ? `, and it happened ${events.length} times in total.` : '.'),
  ];
  const suggestions = [];
  const totals = evaluateAssembly(Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, p.id])), mission).totals;

  const biggerSolar = upgradeFor(solar, 'powerW', bus);
  if (totals.orbitAvgBalanceW < 0) {
    reasons.push(
      `The solar array (${solar.shortName}) supplies only ${solar.stats.powerW} W. Averaged over an orbit the satellite used about `
      + `${fmt(-totals.orbitAvgBalanceW)} W more than the array made, so the battery was running down orbit after orbit.`);
    if (biggerSolar) suggestions.push(`A bigger solar array (${biggerSolar.shortName}, ${biggerSolar.stats.powerW} W) would keep the battery charged.`);
  }
  const biggerBattery = upgradeFor(battery, 'capacityWh', bus);
  suggestions.push(biggerBattery
    ? `A larger battery (${biggerBattery.shortName}, ${biggerBattery.stats.capacityWh} Wh) or charging in SUN-POINT before the eclipse would have prevented safe mode.`
    : 'Charging in SUN-POINT before the eclipse would have prevented safe mode.');
  if (first.modeBefore === 'IMAGE' || first.modeBefore === 'DOWNLINK') {
    suggestions.push('While imaging or downlinking the panels point away from the Sun and give only about half their power, so keep an eye on the battery.');
  }
  return { reasons, suggestions };
}

function dataReasons(parts, mission, stats, state, deliveredMB, success) {
  const { antenna, bus, instrument } = parts;
  const goal = mission.goalMB;
  const reasons = [];
  const suggestions = [];
  const stuck = state.memoryMB;
  const passTotal = mission.nominal.passMinutes * mission.nominal.passesPerOrbit * mission.orbit.orbits;
  const maxSend = antenna.stats.rateMBmin * passTotal;

  if (stuck > Math.max(100, goal * 0.05) && (!success || stuck > goal * 0.2)) {
    const linkLimited = maxSend < goal * SLOW_LINK_GOAL_RATIO;
    reasons.push(linkLimited
      ? `Your ${antenna.shortName} link moved ${antenna.stats.rateMBmin} MB/min; ${fmt(stuck)} MB stayed on board at mission end.`
        + (maxSend < goal ? ` Even using every pass perfectly it could send only ${fmtMB(maxSend)}, below the ${fmtMB(goal)} goal.` : '')
      : `${fmtMB(stuck)} was collected but still on board at mission end, never sent to the ground.`);
    const faster = linkLimited ? upgradeFor(antenna, 'rateMBmin', bus) : null;
    if (faster) suggestions.push(`The ${faster.shortName} moves ${faster.stats.rateMBmin} MB/min and would have emptied the memory.`);
    else if (stats.unusedPassMinutes < UNUSED_PASS_NOTE_MIN) suggestions.push('Start DOWNLINK the moment a pass begins so no contact time is wasted.');
  }
  if (state.dataLostMB > 20) {
    reasons.push(
      `${fmtMB(state.dataLostMB)} of imagery was thrown away because the on-board memory (${fmt(bus.stats.storageMB)} MB) was already full.`);
    suggestions.push(bus.stats.storageMB < 8000
      ? 'Downlink before the next target window opens, or use the SB-90 bus with 8 000 MB of memory.'
      : 'Downlink before the next target window opens so there is room for new pictures.');
  }
  if (!success && stats.imagedMB > 0 && stats.imagedMB < goal * 0.9 && stats.missedTargetMinutes > 8 && stuck <= goal * 0.2) {
    const missed = Math.round(stats.missedTargetMinutes);
    reasons.push(
      `The instrument was pointed at a target for only ${Math.round(stats.imagedInTargetMinutes)} of ${Math.round(stats.targetMinutes)} minutes `
      + `(${missed} minutes missed), collecting ${fmtMB(stats.imagedMB)} at ${instrument.stats.dataRateMBmin} MB/min.`);
    suggestions.push('Switch to IMAGE the moment a target window opens; the window list shows what is coming next.');
  }
  if (stats.unusedPassMinutes >= UNUSED_PASS_NOTE_MIN) {
    reasons.push(`${Math.round(stats.unusedPassMinutes)} minutes of ground-station contact passed with data on board while the antenna was off.`);
    suggestions.push('Switch to DOWNLINK as soon as a pass begins; data cannot be sent outside a pass.');
  }
  if (stats.idleImagingMinutes >= 5) {
    const wh = (stats.idleImagingMinutes / 60) * instrument.stats.powerW;
    reasons.push(`The instrument ran for ${Math.round(stats.idleImagingMinutes)} minutes with no target in view, using about ${fmt(wh)} Wh and collecting nothing.`);
    suggestions.push('Use IMAGE only while a target window is open; SUN-POINT recharges the battery in between.');
  }
  if (stats.imagedMB === 0 && deliveredMB === 0 && !stats.idleImagingMinutes) {
    reasons.push('LUMEN-1 never imaged a target: it stayed in SUN-POINT for the whole mission.');
    suggestions.push('Switch to IMAGE when a target window opens, then to DOWNLINK during a ground-station pass.');
  }
  return { reasons, suggestions };
}

function positives(parts, mission, stats, state, deliveredMB, success) {
  const out = [];
  if (stats.imagedMB === 0) return out;
  const goal = mission.goalMB;
  if (success && deliveredMB >= goal * 1.3) out.push(`Excellent margin: ${fmtMB(deliveredMB)} delivered, ${fmt((deliveredMB / goal) * 100)} % of the goal.`);
  else if (success) out.push(`Goal reached: ${fmtMB(deliveredMB)} delivered, ${fmt((deliveredMB / goal) * 100)} % of the goal.`);
  if (stats.safeModeCount === 0) {
    out.push(`Power stayed healthy: the ${parts.battery.shortName} never dropped below ${Math.round(stats.minBatteryPct)} % charge.`);
  }
  if (state.dataLostMB < 1 && stats.imagedMB > 0) out.push('Nothing was lost: the memory never overflowed.');
  if (parts.instrument.stats.resolutionM <= 10) {
    out.push(`The ${parts.instrument.shortName} resolves ${parts.instrument.stats.resolutionM} m, small enough to pick out individual fire fronts.`);
  }
  if (stats.passMinutes > 0 && stats.unusedPassMinutes < 3 && stats.downlinkMinutes > 0) out.push('Ground-station passes were used well.');
  return out;
}

export function analyzeMission({ parts, mission, stats, log, state }) {
  const deliveredMB = state.deliveredMB;
  const objectives = buildObjectives(parts, mission, stats, deliveredMB);
  const success = objectives[0].met;
  const stars = starsFor(objectives);

  const safe = safeModeReasons(parts, mission, stats, log);
  const data = dataReasons(parts, mission, stats, state, deliveredMB, success);
  const headline = success
    ? `Mission success: ${fmtMB(deliveredMB)} reached the ground, ${fmt((deliveredMB / mission.goalMB) * 100)} % of the goal.`
    : `Mission failed: only ${fmtMB(deliveredMB)} of the ${fmtMB(mission.goalMB)} goal reached the ground.`;

  return {
    success,
    stars,
    objectives,
    deliveredMB,
    goalMB: mission.goalMB,
    dataLostMB: state.dataLostMB,
    safeModeCount: stats.safeModeCount,
    unusedPassMinutes: round1(stats.unusedPassMinutes),
    missedTargetMinutes: round1(stats.missedTargetMinutes),
    onboardMB: state.memoryMB,
    reasons: [headline, ...safe.reasons, ...data.reasons],
    suggestions: [...safe.suggestions, ...data.suggestions],
    positives: positives(parts, mission, stats, state, deliveredMB, success),
  };
}
