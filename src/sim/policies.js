// Scripted operators used by the balancing tests. A policy maps the sim state to the mode to fly next.

const MEMORY_BUSY_PCT = 70;
const CHARGE_BEFORE_ECLIPSE_PCT = 50;
const CHARGE_LEAD_MINUTES = 12;
const SKIP_ECLIPSE_DOWNLINK_PCT = 35;

function greedy(s) {
  if (s.inTarget && s.inPass) return s.memoryPct > MEMORY_BUSY_PCT ? 'DOWNLINK' : 'IMAGE';
  if (s.inTarget) return 'IMAGE';
  if (s.inPass) return 'DOWNLINK';
  return 'SUN';
}

/** Greedy, but protects the battery: recharge before eclipse and skip a draining eclipse downlink. */
function smart(s) {
  if (s.sunlit && s.timeToEclipseStart <= CHARGE_LEAD_MINUTES && s.batteryPct < CHARGE_BEFORE_ECLIPSE_PCT) return 'SUN';
  if (!s.sunlit && s.inPass && s.batteryPct < SKIP_ECLIPSE_DOWNLINK_PCT) return 'SUN';
  return greedy(s);
}

export const policies = {
  greedy,
  careless: () => 'IMAGE',
  idle: () => 'SUN',
  smart,
};

/** Fly the whole mission with a policy, deciding every `decisionMinutes`. Returns the finished sim. */
export function runPolicy(sim, policy, decisionMinutes = 0.25) {
  while (!sim.state.done) {
    sim.setMode(policy(sim.state, sim));
    sim.step(decisionMinutes);
  }
  return sim;
}
