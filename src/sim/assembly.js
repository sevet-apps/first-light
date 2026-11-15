// Pre-launch readiness check: totals and plain-English checks for a satellite assembly.
import { CATEGORIES, CATEGORY_LABELS, catalog, getPart } from '../data/components.js';
import { fmt, fmtMusd } from '../data/format.js';

const A_OR_AN = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Why `part` cannot be mounted on `bus`, or null if it can. */
function incompatibility(part, bus) {
  if (part.category === 'instrument' && bus.stats.maxInstrumentKg < part.mass) {
    return `The ${bus.shortName} bus can only carry an instrument up to ${bus.stats.maxInstrumentKg} kg, `
      + `and the ${part.shortName} weighs ${part.mass} kg.`;
  }
  if (part.stats.requiresBus && !part.stats.requiresBus.includes(bus.id)) {
    const need = part.stats.requiresBus.map((id) => getPart(id).shortName).join(' or ');
    return `The ${part.shortName} needs the ${need} bus; the ${bus.shortName} cannot support it.`;
  }
  const allowed = bus.stats.allows[part.category];
  if (allowed && !allowed.includes(part.id)) {
    return `The ${bus.shortName} bus has no mount for the ${part.shortName}.`;
  }
  return null;
}

/** Hangar ghost preview: can `partId` be placed on this assembly? -> {ok, reason}. */
export function compatibilityFor(partId, assembly) {
  const part = getPart(partId);
  if (!part) return { ok: false, reason: 'Unknown part.' };
  if (part.category === 'bus') {
    for (const cat of CATEGORIES) {
      const other = getPart(assembly[cat]);
      if (cat === 'bus' || !other) continue;
      const reason = incompatibility(other, part);
      if (reason) return { ok: false, reason: `Swapping the bus would break the ${other.shortName}. ${reason}` };
    }
    return { ok: true, reason: '' };
  }
  const bus = getPart(assembly.bus);
  if (!bus) return { ok: false, reason: 'Install a bus first.' };
  const reason = incompatibility(part, bus);
  return reason ? { ok: false, reason } : { ok: true, reason: '' };
}

/** All single swaps to a cheaper (or lighter) compatible part of the same category. */
function savingSwaps(parts, key) {
  const options = [];
  for (const cat of CATEGORIES) {
    const current = parts[cat];
    if (!current || cat === 'bus') continue;
    for (const alt of catalog.byCategory[cat]) {
      const saving = current[key] - alt[key];
      if (saving > 0 && !incompatibility(alt, parts.bus)) options.push({ current, alt, saving });
    }
  }
  return options;
}

function estimateTotals(parts, mission) {
  const { orbit, nominal, ops } = mission;
  const { bus, instrument, solar, battery, antenna } = parts;
  const base = bus?.stats.baseLoadW ?? 0;
  const imaging = instrument?.stats.powerW ?? 0;
  const downlink = antenna?.stats.powerW ?? 0;
  const solarW = solar?.stats.powerW ?? 0;

  const targetMin = nominal.targetsPerOrbit * nominal.targetMinutes;
  const passMin = nominal.passesPerOrbit * nominal.passMinutes;
  const eclipseMin = orbit.orbitMinutes * orbit.eclipseFraction;
  const sunlitMin = orbit.orbitMinutes - eclipseMin;
  const sunlitPassMin = passMin - nominal.eclipsePassesPerOrbit * nominal.passMinutes;
  const pointingMin = targetMin + sunlitPassMin; // sunlit minutes spent pointing away from the Sun
  const sunMin = sunlitMin - pointingMin;

  const energyInWh = (solarW * (sunMin + ops.pointingSolarFraction * pointingMin)) / 60;
  const energyOutWh = (base * orbit.orbitMinutes + imaging * targetMin + downlink * passMin) / 60;
  const windows = orbit.orbits;

  return {
    mass: sumOf(parts, 'mass'),
    cost: sumOf(parts, 'cost'),
    sunlitPowerW: solarW,
    loads: { base, imaging, downlink },
    orbitAvgBalanceW: ((energyInWh - energyOutWh) / orbit.orbitMinutes) * 60,
    eclipseNeedWh: (base * eclipseMin + downlink * nominal.passMinutes) / 60,
    eclipseMinutes: eclipseMin,
    storageMB: bus?.stats.storageMB ?? 0,
    batteryWh: battery?.stats.capacityWh ?? 0,
    imageryPerOrbitMB: (instrument?.stats.dataRateMBmin ?? 0) * targetMin,
    maxImageryMB: (instrument?.stats.dataRateMBmin ?? 0) * targetMin * windows,
    maxDownlinkMB: (antenna?.stats.rateMBmin ?? 0) * passMin * windows,
  };
}

const sumOf = (parts, key) =>
  Math.round(Object.values(parts).reduce((sum, p) => sum + (p ? p[key] : 0), 0) * 100) / 100;

/**
 * Evaluate an assembly {bus, instrument, solar, battery, antenna} (part ids or null).
 * Loads are the extra draw of each mode on top of `base`: IMAGE draws base+imaging, DOWNLINK base+downlink.
 */
export function evaluateAssembly(assembly, mission) {
  const parts = Object.fromEntries(CATEGORIES.map((c) => [c, getPart(assembly?.[c])]));
  const totals = estimateTotals(parts, mission);
  const checks = [];
  const add = (id, severity, title, detail, fix = '') => checks.push({ id, severity, title, detail, fix });

  // Blockers: every slot filled
  for (const cat of CATEGORIES) {
    if (parts[cat]) continue;
    const label = CATEGORY_LABELS[cat].toLowerCase();
    add(`missing_${cat}`, 'blocker', `No ${label} installed`,
      cat === 'bus'
        ? 'Without a bus there is nothing to hold the other parts or run the satellite.'
        : `The satellite has no ${label}, so it cannot work in orbit.`,
      `Pick ${A_OR_AN(label)} ${label} from the rack and install it on the integration stand.`);
  }

  // Blockers: budget and mass
  if (totals.cost > mission.budgetMusd) {
    add('over_budget', 'blocker', 'Over budget',
      `The parts cost ${fmtMusd(totals.cost)} but the mission budget is ${fmtMusd(mission.budgetMusd)}, `
      + `${fmtMusd(Math.round((totals.cost - mission.budgetMusd) * 10) / 10)} too much.`,
      swapAdvice(parts, 'cost', totals.cost - mission.budgetMusd, fmtMusd));
  } else if (parts.bus) {
    add('budget', 'ok', 'Budget',
      `${fmtMusd(totals.cost)} of ${fmtMusd(mission.budgetMusd)} used, ${fmtMusd(Math.round((mission.budgetMusd - totals.cost) * 10) / 10)} to spare.`);
  }
  if (totals.mass > mission.capacityKg) {
    add('over_mass', 'blocker', 'Too heavy for the rocket',
      `The satellite weighs ${fmt(totals.mass)} kg but the launcher can lift only ${fmt(mission.capacityKg)} kg to orbit, `
      + `${fmt(totals.mass - mission.capacityKg)} kg too much.`,
      swapAdvice(parts, 'mass', totals.mass - mission.capacityKg, (n) => `${fmt(n)} kg`));
  } else if (parts.bus) {
    add('mass', 'ok', 'Launch mass',
      `${fmt(totals.mass)} kg of ${fmt(mission.capacityKg)} kg capacity, ${fmt(mission.capacityKg - totals.mass)} kg of margin.`);
  }

  // Blockers: compatibility
  let compatible = true;
  if (parts.bus) {
    for (const cat of CATEGORIES.filter((c) => c !== 'bus' && parts[c])) {
      const reason = incompatibility(parts[cat], parts.bus);
      if (!reason) continue;
      compatible = false;
      add(`incompatible_${cat}`, 'blocker', `${parts[cat].shortName} does not fit the ${parts.bus.shortName}`,
        `${reason} Bolting it on would not work.`,
        incompatibleFix(cat, parts));
    }
    if (compatible) add('compatibility', 'ok', 'Compatibility', 'Every part fits the bus.');
  }

  const ready = CATEGORIES.every((c) => parts[c]);
  if (ready) addPerformanceChecks(add, parts, totals, mission);

  const canIntegrate = !checks.some((c) => c.severity === 'blocker');
  return { totals, checks, canIntegrate };
}

/** Concrete fix text: the mildest single swap that covers `excess`, plus a two-swap alternative. */
function swapAdvice(parts, key, excess, format) {
  const options = savingSwaps(parts, key);
  const describe = (o) => `the ${o.current.shortName} (${format(o.current[key])}) for the ${o.alt.shortName} (${format(o.alt[key])})`;
  const amount = (n) => format(Math.round(n * 10) / 10);
  const singles = options.filter((o) => o.saving >= excess).sort((a, b) => a.saving - b.saving);
  const pairs = [];
  options.forEach((x, i) => options.slice(i + 1).forEach((y) => {
    if (x.current.category !== y.current.category && x.saving + y.saving >= excess) pairs.push([x, y]);
  }));
  pairs.sort((a, b) => a[0].saving + a[1].saving - b[0].saving - b[1].saving);
  const advice = [];
  if (singles[0]) advice.push(`Swap ${describe(singles[0])}, saving ${amount(singles[0].saving)}`);
  if (pairs[0]) {
    const [x, y] = pairs[0];
    advice.push(`${advice.length ? 'or swap' : 'Swap'} ${describe(x)} and ${describe(y)}, saving ${amount(x.saving + y.saving)} together`);
  }
  return advice.length ? advice.join(', ') + '.' : 'Choose cheaper or lighter parts.';
}

function incompatibleFix(cat, parts) {
  const { bus } = parts;
  const part = parts[cat];
  const fits = catalog.byCategory[cat].filter((p) => !incompatibility(p, bus));
  const smallBus = getPart('bus_small');
  const alternatives = fits.length ? fits.map((p) => p.shortName).join(' or ') : null;
  const swapBus = !incompatibility(part, smallBus) && bus.id !== smallBus.id
    ? `Upgrade the bus to the ${smallBus.shortName}` : null;
  const swapPart = alternatives ? `choose ${alternatives} instead` : null;
  return [swapBus, swapPart].filter(Boolean).join(', or ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

function addPerformanceChecks(add, parts, totals, mission) {
  const { bus, instrument, solar, battery, antenna } = parts;
  const goal = mission.goalMB;
  const { nominal, orbit } = mission;

  // Power balance
  const bal = totals.orbitAvgBalanceW;
  if (bal < 0) {
    const bigger = catalog.byCategory.solar.find((p) => p.stats.powerW > solar.stats.powerW && !incompatibility(p, bus));
    add('power_balance', 'warning', 'Power budget is negative',
      `In a typical orbit (${nominal.targetsPerOrbit} imaging windows, ${nominal.passesPerOrbit} downlinks) the ${solar.shortName} `
      + `(${solar.stats.powerW} W) cannot keep up: the battery loses about ${fmt(-bal, 0)} W on average, so it drains `
      + 'orbit after orbit and the satellite will go into safe mode.',
      bigger
        ? `Fit a bigger solar array such as the ${bigger.shortName} (${bigger.stats.powerW} W), or spend more time in SUN-POINT.`
        : 'Spend more time in SUN-POINT to recharge, or fly a lower-power instrument.');
  } else {
    add('power_balance', 'ok', 'Power budget',
      `The ${solar.shortName} produces ${fmt(bal, 0)} W more than a typical orbit uses, so the battery recharges.`);
  }

  // Battery vs the longest eclipse
  const need = totals.eclipseNeedWh;
  if (battery.stats.capacityWh < need) {
    const bigger = catalog.byCategory.battery.find((p) => p.stats.capacityWh >= need);
    add('eclipse_battery', 'warning', 'Battery too small for the eclipse',
      `In the ${fmt(totals.eclipseMinutes, 0)}-minute eclipse the satellite has no sunlight and needs about ${fmt(need, 0)} Wh `
      + `for its base load plus one downlink, but the ${battery.shortName} holds only ${battery.stats.capacityWh} Wh.`,
      bigger ? `Fit the ${bigger.shortName} (${bigger.stats.capacityWh} Wh).` : 'Cut loads or add battery capacity.');
  } else {
    add('eclipse_battery', 'ok', 'Eclipse reserve',
      `The ${battery.shortName} (${battery.stats.capacityWh} Wh) covers the ${fmt(need, 0)} Wh needed in a ${fmt(totals.eclipseMinutes, 0)}-minute eclipse.`);
  }

  // Data plan
  const windows = orbit.orbits * nominal.targetsPerOrbit;
  if (totals.maxImageryMB < goal) {
    const better = catalog.byCategory.instrument.find((p) => p.stats.dataRateMBmin > instrument.stats.dataRateMBmin && !incompatibility(p, bus));
    add('imagery_short', 'warning', 'Camera cannot collect enough',
      `Even if you image every second of all ${windows} target windows, the ${instrument.shortName} collects at most `
      + `${fmt(totals.maxImageryMB)} MB (${instrument.stats.dataRateMBmin} MB/min), less than the ${fmt(goal)} MB goal.`,
      better ? `Use a faster instrument such as the ${better.shortName} (${better.stats.dataRateMBmin} MB/min).` : 'Choose a faster instrument.');
  }
  if (totals.maxDownlinkMB < goal) {
    const better = catalog.byCategory.antenna.filter((p) => p.stats.rateMBmin > antenna.stats.rateMBmin && !incompatibility(p, bus))
      .sort((a, b) => a.cost - b.cost)[0];
    add('downlink_short', 'warning', 'Radio link too slow',
      `Over all ${orbit.orbits * nominal.passesPerOrbit} ground-station passes (${nominal.passMinutes} min each) the ${antenna.shortName} `
      + `can send at most ${fmt(totals.maxDownlinkMB)} MB (${antenna.stats.rateMBmin} MB/min). That is less than the ${fmt(goal)} MB goal, `
      + 'so data will be stuck on board.',
      better ? `Fit a faster antenna such as the ${better.shortName} (${better.stats.rateMBmin} MB/min).` : 'Choose a faster antenna.');
  }
  if (totals.maxImageryMB >= goal && totals.maxDownlinkMB >= goal) {
    add('data_plan', 'ok', 'Data plan',
      `Up to ${fmt(totals.maxImageryMB)} MB can be collected and ${fmt(totals.maxDownlinkMB)} MB sent down, against a ${fmt(goal)} MB goal.`);
  }

  // Storage
  if (bus.stats.storageMB < totals.imageryPerOrbitMB) {
    const roomier = catalog.byCategory.bus.find((p) => p.stats.storageMB >= totals.imageryPerOrbitMB && !breaksParts(p, parts));
    add('storage_small', 'warning', 'Memory fills up quickly',
      `One orbit of imaging (${nominal.targetsPerOrbit} windows) produces about ${fmt(totals.imageryPerOrbitMB)} MB `
      + `but the ${bus.shortName} stores only ${fmt(bus.stats.storageMB)} MB. If you cannot downlink in between, new pictures are thrown away.`,
      roomier ? `Use the ${roomier.shortName} bus (${fmt(roomier.stats.storageMB)} MB) or a lower-rate instrument.` : 'Use a lower-rate instrument.');
  }
}

/** True if swapping in `bus` would break one of the installed parts. */
function breaksParts(bus, parts) {
  return CATEGORIES.some((c) => c !== 'bus' && parts[c] && incompatibility(parts[c], bus));
}
