// Balancing and correctness tests for the mission model. DOM-free: tests/sim.html renders the returned data.
import { catalog, infoLines, CATEGORIES } from '../src/data/components.js';
import { mission } from '../src/data/mission.js';
import { presets } from '../src/data/presets.js';
import { evaluateAssembly, compatibilityFor } from '../src/sim/assembly.js';
import { createOrbitSim } from '../src/sim/orbit.js';
import { buildSchedule, makeRng } from '../src/sim/schedule.js';
import { policies, runPolicy } from '../src/sim/policies.js';

const POLICY_NAMES = Object.keys(policies);
const SOURCE_FILES = [
  'data/components.js', 'data/mission.js', 'data/presets.js', 'data/format.js',
  'sim/assembly.js', 'sim/orbit.js', 'sim/schedule.js', 'sim/analysis.js', 'sim/policies.js',
];

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const pct = (r) => (r.deliveredMB / r.goalMB) * 100;

/** One simulated mission: config x policy. */
function fly(assembly, policy, seed = 1) {
  return runPolicy(createOrbitSim(assembly, mission, { seed }), policies[policy]).result();
}

function buildMatrix() {
  const rows = [];
  for (const [config, assembly] of Object.entries(presets)) {
    if (!evaluateAssembly(assembly, mission).canIntegrate) continue;
    for (const policy of POLICY_NAMES) {
      const r = fly(assembly, policy);
      rows.push({
        config, policy,
        deliveredMB: Math.round(r.deliveredMB), pct: Math.round(pct(r)), lostMB: Math.round(r.dataLostMB),
        safeModes: r.safeModeCount, stars: r.stars, success: r.success,
      });
    }
  }
  return rows;
}

function readinessReport() {
  const light = { ...mission, capacityKg: 120 };
  const cases = [
    ...Object.entries(presets).map(([name, a]) => [name, a, mission]),
    ['overmass (overbudget parts, 120 kg launcher)', presets.overbudget, light],
    ['empty hangar', {}, mission],
  ];
  return cases.map(([name, assembly, m]) => ({ name, ...evaluateAssembly(assembly, m) }));
}

function scheduleProblems(seed) {
  const sch = buildSchedule(mission, seed);
  const problems = [];
  const sunlit = (t) => !sch.eclipses.some((e) => t >= e.start && t < e.end);
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  if (sch.targets.length !== 6 || sch.passes.length !== 6 || sch.eclipses.length !== 3) problems.push('wrong window counts');
  for (const w of sch.targets) {
    if (!sunlit(w.start) || !sunlit(w.end - 0.25)) problems.push(`${w.name} is not fully sunlit`);
  }
  for (const w of [...sch.targets, ...sch.passes]) {
    if (w.start < 2) problems.push(`${w.name} starts before minute 2`);
    if (typeof w.lat !== 'number' || typeof w.lon !== 'number') problems.push(`${w.name} has no coordinates`);
  }
  if (!sch.passes.some((p) => sch.eclipses.some((e) => overlaps(p, e)))) problems.push('no pass in eclipse');
  if (!sch.targets.some((t) => sch.passes.some((p) => overlaps(t, p)))) problems.push('no target overlaps a pass');
  return problems;
}

/** Same total sim time, three slicings: one big step, quarter-minute steps, random steps. */
function frameRateProblems() {
  const problems = [];
  const snapshot = (sim) => JSON.stringify({ state: { ...sim.state, currentTarget: sim.state.currentTarget?.id, currentPass: sim.state.currentPass?.id }, result: sim.result(), log: sim.log });
  const slicings = {
    whole: (sim, minutes) => sim.step(minutes),
    quarters: (sim, minutes) => { for (let i = 0; i < minutes * 4; i++) sim.step(0.25); },
    random: (sim, minutes, rng) => {
      let left = minutes;
      while (left > 1e-12) {
        const dt = Math.min(left, 0.01 + rng() * 1.7);
        sim.step(dt);
        left -= dt;
      }
    },
  };
  for (const [name, assembly] of Object.entries(presets)) {
    if (!evaluateAssembly(assembly, mission).canIntegrate) continue;
    for (const fixed of ['SUN', 'IMAGE', 'DOWNLINK', 'script']) {
      const out = {};
      for (const [slicing, run] of Object.entries(slicings)) {
        const sim = createOrbitSim(assembly, mission);
        const rng = makeRng(7);
        const orbit = mission.orbit.orbitMinutes;
        if (fixed !== 'script') {
          sim.setMode(fixed);
          run(sim, orbit, rng); // 1 orbit
        } else {
          // Mode decided by the greedy policy every 5 minutes, then slicing within each segment.
          for (let t = 0; t < orbit * mission.orbit.orbits; t += 5) {
            sim.setMode(policies.greedy(sim.state));
            run(sim, 5, rng);
          }
        }
        out[slicing] = snapshot(sim);
      }
      if (out.whole !== out.quarters || out.whole !== out.random) problems.push(`${name} / ${fixed}: results depend on step size`);
    }
  }
  return problems;
}

async function purityProblems() {
  const problems = [];
  for (const file of SOURCE_FILES) {
    const text = await (await fetch(new URL(`../src/${file}`, import.meta.url))).text();
    if (/\b(document|window|navigator|globalThis)\s*[.[]|\blocalStorage\b|\brequestAnimationFrame\b/.test(text)) problems.push(`${file} touches browser globals`);
    if (/from\s+['"]three/.test(text)) problems.push(`${file} imports three`);
  }
  return problems;
}

export async function runSimTests() {
  const expectations = [];
  const expect = (group, name, pass, detail = '') => expectations.push({ group, name, pass: !!pass, detail });

  const matrix = buildMatrix();
  const row = (config, policy) => matrix.find((r) => r.config === config && r.policy === policy);
  const readiness = readinessReport();
  const ready = (name) => readiness.find((r) => r.name === name);
  const hasCheck = (name, id, severity) => ready(name).checks.some((c) => c.id === id && c.severity === severity);
  const detailOf = (name, id) => ready(name).checks.find((c) => c.id === id)?.detail ?? '';

  // overbudget (the priciest part of every category)
  const ob = ready('overbudget');
  expect('overbudget', 'blocker "over budget" and cannot integrate', hasCheck('overbudget', 'over_budget', 'blocker') && !ob.canIntegrate,
    `$${ob.totals.cost} M vs $${mission.budgetMusd} M`);
  expect('overbudget', 'fix names concrete swaps and the money saved', /Swap the .* for the .*saving \$/.test(ob.checks.find((c) => c.id === 'over_budget').fix),
    ob.checks.find((c) => c.id === 'over_budget').fix);

  // balanced
  expect('balanced', 'integrable', ready('balanced').canIntegrate);
  const bg = row('balanced', 'greedy');
  expect('balanced', 'greedy: 100-130 % of goal', bg.pct >= 100 && bg.pct <= 130, `${bg.pct} %`);
  expect('balanced', 'smart: success', row('balanced', 'smart').success);

  // budget
  const budgetCost = ready('budget').totals.cost;
  expect('budget', 'integrable and the cheapest viable config', ready('budget').canIntegrate
    && ['balanced', 'fastlink', 'bigsolar', 'underpowered', 'slowlink'].every((n) => budgetCost < ready(n).totals.cost), `$${budgetCost} M`);
  const ug = row('budget', 'greedy');
  expect('budget', 'greedy: 100-115 % of goal', ug.pct >= 100 && ug.pct <= 115, `${ug.pct} %`);
  expect('budget', 'greedy: at most 2 stars (resolution)', ug.stars === 2, `${ug.stars}`);
  expect('budget', 'careless: fails', !row('budget', 'careless').success);

  // underpowered
  expect('underpowered', 'integrable but warns about power', ready('underpowered').canIntegrate && hasCheck('underpowered', 'power_balance', 'warning'));
  const up = row('underpowered', 'greedy');
  expect('underpowered', 'greedy: at least one safe mode', up.safeModes >= 1, `${up.safeModes}`);
  expect('underpowered', 'greedy: fails', !up.success, `${up.pct} %`);
  const upResult = fly(presets.underpowered, 'greedy');
  const upText = upResult.suggestions.join(' ');
  expect('underpowered', 'suggestions mention solar and battery', /solar/i.test(upText) && /battery/i.test(upText));

  // fastlink: the piloting test
  const fl = ready('fastlink');
  expect('fastlink', `integrable within $${mission.budgetMusd} M`, fl.canIntegrate && fl.totals.cost <= mission.budgetMusd, `$${fl.totals.cost} M`);
  const flg = row('fastlink', 'greedy');
  const fls = row('fastlink', 'smart');
  expect('fastlink', 'greedy: at least one safe mode (loses the Resilient star)', flg.safeModes >= 1 && flg.stars <= 2, `${flg.safeModes} safe, ${flg.stars} stars`);
  expect('fastlink', 'smart: 0 safe modes, success, 3 stars', fls.safeModes === 0 && fls.success && fls.stars === 3, `${fls.safeModes} safe, ${fls.pct} %, ${fls.stars} stars`);
  expect('fastlink', 'debrief of greedy blames the battery and suggests a fix', (() => {
    const r = fly(presets.fastlink, 'greedy');
    return r.reasons.some((x) => /Battery ran flat/.test(x)) && r.suggestions.some((x) => /battery|SUN-POINT/i.test(x));
  })());

  expect('fastlink', 'safe mode in SUN-POINT names the activity that drained the battery', (() => {
    const first = fly(presets.fastlink, 'greedy').reasons[1];
    return /base systems after downlinking through the eclipse/.test(first);
  })(), fly(presets.fastlink, 'greedy').reasons[1]);
  expect('underpowered', 'safe mode with no earlier drain keeps the plain base-systems wording', /while running only its base systems in SUN-POINT/.test(fly(presets.underpowered, 'idle').reasons[1]));

  // bigsolar: reported only, but its debrief must be readable
  const bsr = fly(presets.bigsolar, 'greedy');
  expect('bigsolar', 'integrable and has a headline plus explanations', ready('bigsolar').canIntegrate && bsr.reasons.length >= 1 && bsr.positives.length >= 1,
    `greedy ${row('bigsolar', 'greedy').pct} %, ${row('bigsolar', 'greedy').safeModes} safe; smart ${row('bigsolar', 'smart').pct} %, ${row('bigsolar', 'smart').safeModes} safe`);

  // economy: real trade-offs
  const winners = Object.keys(presets).filter((n) => ready(n).canIntegrate && row(n, 'smart').success);
  expect('economy', 'at least 3 integrable configs within budget succeed under smart', winners.length >= 3, winners.join(', '));
  const profile = (n) => `${ready(n).totals.cost}|${presets[n].instrument}|${presets[n].antenna}`;
  expect('economy', 'those winners have different profiles', new Set(winners.map(profile)).size === winners.length);
  const pilotable = Object.keys(presets).filter((n) => ready(n).canIntegrate && row(n, 'smart').stars > row(n, 'greedy').stars);
  expect('economy', 'at least one config where smart earns more stars than greedy', pilotable.length >= 1, pilotable.join(', '));

  // slowlink
  expect('slowlink', 'integrable but warns about the radio link', ready('slowlink').canIntegrate && hasCheck('slowlink', 'downlink_short', 'warning'));
  expect('slowlink', 'greedy: fails', !row('slowlink', 'greedy').success, `${row('slowlink', 'greedy').pct} %`);
  expect('slowlink', 'reasons say data is stuck on board', fly(presets.slowlink, 'greedy').reasons.some((r) => /on board/.test(r)));

  // blockers
  expect('overmass', 'blocker "too heavy" (overbudget parts, 120 kg launcher)', hasCheck('overmass (overbudget parts, 120 kg launcher)', 'over_mass', 'blocker'));
  expect('incompatible', 'MB-40 + HRI-5 is a blocker with a reason', hasCheck('incompatible', 'incompatible_instrument', 'blocker')
    && /12 kg/.test(detailOf('incompatible', 'incompatible_instrument')), detailOf('incompatible', 'incompatible_instrument'));
  expect('incompatible', 'MB-40 + X-Band is a blocker with a reason', hasCheck('incompatible', 'incompatible_antenna', 'blocker')
    && /SB-90/.test(detailOf('incompatible', 'incompatible_antenna')), detailOf('incompatible', 'incompatible_antenna'));
  expect('incompatible', 'cannot integrate', !ready('incompatible').canIntegrate);
  expect('empty hangar', 'five missing-part blockers', ready('empty hangar').checks.filter((c) => c.id.startsWith('missing_')).length === 5);

  // hangar ghost preview
  const none = compatibilityFor('inst_wfc', {});
  expect('compatibilityFor', 'part without a bus -> "Install a bus first"', !none.ok && /Install a bus first/.test(none.reason), none.reason);
  expect('compatibilityFor', 'bus is always placeable on an empty stand', compatibilityFor('bus_micro', {}).ok);
  expect('compatibilityFor', 'HRI-5 on MB-40 is refused', !compatibilityFor('inst_hri', { bus: 'bus_micro' }).ok);
  expect('compatibilityFor', 'X-Band on SB-90 is accepted', compatibilityFor('ant_xband', { bus: 'bus_small' }).ok);
  expect('compatibilityFor', 'swapping to MB-40 under an HRI-5 is refused', !compatibilityFor('bus_micro', presets.overbudget).ok);

  // idle + careless
  for (const config of Object.keys(presets)) {
    if (!ready(config).canIntegrate) continue;
    const idle = row(config, 'idle');
    expect('idle', `${config}: fails with 0 MB delivered`, !idle.success && idle.deliveredMB === 0);
    expect('careless', `${config}: fails`, !row(config, 'careless').success);
  }

  // catalog
  expect('catalog', 'ids as in the design', ['bus_micro', 'bus_small', 'inst_wfc', 'inst_hri', 'sol_body', 'sol_2wing', 'sol_4panel', 'bat_120', 'bat_400', 'ant_uhf', 'ant_sband', 'ant_xband']
    .every((id) => catalog.byId[id]) && catalog.parts.length === 12);
  expect('catalog', 'every part has info lines and a description', catalog.parts.every((p) => infoLines(p).length >= 3 && p.description.length > 20 && CATEGORIES.includes(p.category)));

  // schedule
  const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
  const badSeeds = seeds.map((s) => [s, scheduleProblems(s)]).filter(([, p]) => p.length);
  expect('schedule', 'constraints hold for seeds 1-25', badSeeds.length === 0, badSeeds.map(([s, p]) => `seed ${s}: ${p.join(', ')}`).join('; '));

  // determinism
  const again = buildMatrix();
  const hash = fnv1a(JSON.stringify(matrix));
  expect('determinism', 'second run gives identical results', fnv1a(JSON.stringify(again)) === hash, hash);
  const logsA = JSON.stringify(fly(presets.balanced, 'smart'));
  expect('determinism', 'result objects are identical on rerun', logsA === JSON.stringify(fly(presets.balanced, 'smart')));

  // frame-rate independence
  const fr = frameRateProblems();
  expect('frame rate', '1x95 min = 380x0.25 min = random dt (all modes, all configs)', fr.length === 0, fr.join('; '));

  // robustness against the schedule seed
  const seedProblems = [];
  for (const s of [2, 3, 4, 5]) {
    if (fly(presets.fastlink, 'greedy', s).safeModeCount < 1) seedProblems.push(`fastlink greedy has no safe mode with seed ${s}`);
    if (!fly(presets.fastlink, 'smart', s).success) seedProblems.push(`fastlink smart fails with seed ${s}`);
    if (!fly(presets.balanced, 'greedy', s).success) seedProblems.push(`balanced fails with seed ${s}`);
    if (!fly(presets.budget, 'greedy', s).success) seedProblems.push(`budget fails with seed ${s}`);
    if (fly(presets.underpowered, 'greedy', s).success) seedProblems.push(`underpowered succeeds with seed ${s}`);
    if (fly(presets.slowlink, 'greedy', s).success) seedProblems.push(`slowlink succeeds with seed ${s}`);
  }
  expect('schedule', 'balancing outcomes survive seeds 2-5', seedProblems.length === 0, seedProblems.join('; '));

  // purity
  const impure = await purityProblems();
  expect('purity', 'src/sim and src/data have no DOM or three.js dependency', impure.length === 0, impure.join('; '));

  const passed = expectations.filter((e) => e.pass).length;
  return {
    allPass: passed === expectations.length,
    passed,
    failed: expectations.length - passed,
    hash,
    matrix,
    expectations,
    readiness,
    sampleResults: Object.fromEntries(['underpowered', 'slowlink', 'balanced'].map((c) => [c, fly(presets[c], 'greedy')])),
  };
}
