// Deterministic orbit schedule: eclipses, imaging target windows and ground-station passes.

const TARGET_REGIONS = [
  { name: 'California Sierra Nevada', lat: 37.7, lon: -119.5 },
  { name: 'Mediterranean Coast', lat: 38.5, lon: 23.5 },
  { name: 'Australian Outback', lat: -24.5, lon: 133.5 },
  { name: 'Amazon Arc of Deforestation', lat: -9.5, lon: -55.0 },
  { name: 'Siberian Taiga', lat: 61.0, lon: 100.0 },
  { name: 'Cerrado Savanna', lat: -15.5, lon: -47.5 },
];

const STATIONS = [
  { name: 'Svalbard', lat: 78.2, lon: 15.4 },
  { name: 'Fairbanks', lat: 64.8, lon: -147.7 },
  { name: 'Kiruna', lat: 67.9, lon: 21.1 },
  { name: 'Punta Arenas', lat: -53.2, lon: -70.9 },
  { name: 'Hartebeesthoek', lat: -25.9, lon: 27.7 },
];

// Start offsets (minutes into each orbit) of the two targets and two passes. Orbit 1 forces a
// target-versus-pass decision; orbit 2 has a pass that straddles the sunset terminator.
const ORBIT_TEMPLATES = [
  { targets: [9, 40], passes: [24, 70] },
  { targets: [11, 38], passes: [41, 72] },
  { targets: [14, 51], passes: [30, 55] },
];

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quarter = (x) => Math.round(x * 4) / 4;

/**
 * Build the schedule. `seed` shifts window starts by up to +-1 minute and rotates the region and station names,
 * but never breaks the constraints (verified by the tests): targets are sunlit, at least one pass is in
 * eclipse, at least one target overlaps a pass and nothing starts in the first 2 minutes.
 */
export function buildSchedule(mission, seed = 1) {
  const { orbits, orbitMinutes, eclipseFraction } = mission.orbit;
  const { targetMinutes, passMinutes } = mission.nominal;
  const rng = makeRng(seed);
  const jitter = () => quarter((rng() - 0.5) * 2);
  const sunlitMinutes = orbitMinutes * (1 - eclipseFraction);

  const schedule = { eclipses: [], targets: [], passes: [], totalMinutes: orbits * orbitMinutes };
  const offsetTarget = Math.floor(rng() * TARGET_REGIONS.length);
  const offsetStation = Math.floor(rng() * STATIONS.length);

  for (let o = 0; o < orbits; o++) {
    const base = o * orbitMinutes;
    const template = ORBIT_TEMPLATES[o % ORBIT_TEMPLATES.length];
    schedule.eclipses.push({ orbit: o, start: base + sunlitMinutes, end: base + orbitMinutes });

    template.targets.forEach((offset, i) => {
      const n = o * 2 + i;
      const start = base + offset + jitter();
      const region = TARGET_REGIONS[(n + offsetTarget) % TARGET_REGIONS.length];
      schedule.targets.push({ id: `target_${n}`, orbit: o, start, end: start + targetMinutes, ...region });
    });
    template.passes.forEach((offset, i) => {
      const n = o * 2 + i;
      const start = base + offset + jitter();
      const station = STATIONS[(n + offsetStation) % STATIONS.length];
      schedule.passes.push({ id: `pass_${n}`, orbit: o, start, end: start + passMinutes, ...station });
    });
  }
  return schedule;
}

export const inInterval = (list, t) => list.find((w) => t >= w.start && t < w.end) ?? null;
