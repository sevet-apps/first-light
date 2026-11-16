// The one-line "what should I do now" advice under the world. Pure: simulation state in, sentence out.

const ECLIPSE_WARNING_MINUTES = 8;
const BATTERY_CAUTION_PCT = 60;
const BATTERY_LOW_PCT = 25;
const MEMORY_BUSY_PCT = 70;

const mins = (m) => `${Math.max(1, Math.round(m))} min`;
const pct = (v) => `${Math.round(v)} %`;

/**
 * @param {object} state sim.state
 * @param {object[]} upcoming sim.upcoming(n)
 * @param {{ eclipseEndsIn: number | null }} context minutes until the current eclipse ends
 * @returns {string}
 */
export function hintFor(state, upcoming, { eclipseEndsIn = null } = {}) {
  const { mode, batteryPct, memoryPct, inTarget, inPass, sunlit } = state;
  if (mode === 'SAFE') return `Safe mode: the battery ran flat. Controls return in ${mins(state.safeModeRemaining)}.`;

  const pass = state.currentPass;
  const target = state.currentTarget;
  const low = batteryPct < BATTERY_LOW_PCT;
  const eclipse = upcoming.find((e) => e.type === 'eclipse');

  if (low && mode !== 'SUN') return `Battery at ${pct(batteryPct)}. Switch to SUN-POINT (1) before it runs flat.`;
  if (!sunlit && mode === 'SUN') {
    if (inPass && state.memoryMB > 1 && batteryPct >= BATTERY_CAUTION_PCT) return `In Earth's shadow with ${pass.name} overhead. Battery ${pct(batteryPct)}: DOWNLINK (3) is affordable.`;
    return `In Earth's shadow for ${mins(eclipseEndsIn ?? 0)} more. Battery ${pct(batteryPct)}; stay in SUN-POINT (1).`;
  }
  if (!sunlit && mode === 'DOWNLINK' && !inPass) return `No station in view and no sunlight. Switch to SUN-POINT (1) to save power.`;
  if (!sunlit && mode === 'DOWNLINK') return `Downlinking in the dark. Battery ${pct(batteryPct)}; drop to SUN-POINT (1) if it gets low.`;

  if (inTarget && inPass) {
    return memoryPct > MEMORY_BUSY_PCT
      ? `Memory ${pct(memoryPct)} full while ${target.name} and ${pass.name} overlap. Switch to DOWNLINK (3) to make room.`
      : `${target.name} and the ${pass.name} pass overlap. IMAGE (2) collects, DOWNLINK (3) delivers: you choose.`;
  }
  if (inPass && mode !== 'DOWNLINK') {
    return state.memoryMB > 1
      ? `${pass.name} pass in progress. Switch to DOWNLINK (3).`
      : `${pass.name} pass in progress, but there is nothing to send yet.`;
  }
  if (inTarget && mode !== 'IMAGE') return memoryPct >= 99 ? `${target.name} is in view but the memory is full. Send data at the next pass.` : `${target.name} in view. Switch to IMAGE (2).`;
  if (inTarget && memoryPct >= 99) return 'Memory full: new pictures are being lost. Downlink at the next pass.';
  if (inTarget) return `Imaging ${target.name}. Keep going until the window closes.`;
  if (inPass) return `Downlinking to ${pass.name}. Stay on DOWNLINK until the data is sent.`;
  if (mode === 'IMAGE') return 'No target in view: IMAGE only burns power. Switch to SUN-POINT (1).';
  if (mode === 'DOWNLINK') return 'No station in range: DOWNLINK only burns power. Switch to SUN-POINT (1).';

  if (sunlit && eclipse && eclipse.startsIn <= ECLIPSE_WARNING_MINUTES) {
    return batteryPct < BATTERY_CAUTION_PCT
      ? `Eclipse in ${mins(eclipse.startsIn)}, battery ${pct(batteryPct)}. Stay in SUN-POINT (1) to charge.`
      : `Eclipse in ${mins(eclipse.startsIn)}, battery ${pct(batteryPct)}: well charged.`;
  }
  const next = upcoming.find((e) => e.type !== 'eclipse');
  if (next) {
    const what = next.type === 'target' ? `Imaging target ${next.name}` : `${next.name} pass`;
    return `${what} in ${mins(next.startsIn)}.${mode === 'SUN' ? ' SUN-POINT charges the battery meanwhile.' : ''}`;
  }
  return 'All windows are behind you. Hold SUN-POINT (1) until the mission ends.';
}
