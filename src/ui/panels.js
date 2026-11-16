// Composite Flight Manual documents and HUD panels built from the components. Pure DOM builders over plain data,
// so the hangar (T3), orbit (T4) and debrief (T4) tickets only feed them real game data.
import { el } from './dom.js';
import { icon } from './icons.js';
import { stagger } from './motion.js';
import {
  button, checklist, displayTitle, documentCard, meter, microLabel, segmented, specList, stars, statBlock,
} from './components.js';
import { CATEGORIES, CATEGORY_LABELS, getPart, infoLines } from '../data/components.js';
import { compatibilityFor } from '../sim/assembly.js';
import { fmt, fmtMusd } from '../data/format.js';

const pad2 = (n) => String(n).padStart(2, '0');
const SEVERITY_ORDER = { blocker: 0, warning: 1, ok: 2 };

/** "HRI-5 Hi-Res Multispectral Imager" -> "HRI-5 Imager"; names without a code stay whole. */
export function partTitle(part) {
  if (part.name === part.shortName || !part.name.startsWith(part.shortName)) return part.name;
  return `${part.shortName} ${part.name.split(' ').pop()}`;
}

const keyStat = (part) => {
  const s = part.stats;
  if (s.powerW !== undefined) return { label: part.category === 'solar' ? 'Output' : 'Power', value: s.powerW, unit: 'W' };
  if (s.baseLoadW !== undefined) return { label: 'Base load', value: s.baseLoadW, unit: 'W' };
  return { label: 'Capacity', value: s.capacityWh, unit: 'Wh' };
};

/**
 * Part info card for the hangar. `installed` swaps Install for Put back as the primary action.
 * `assembly` (slot -> part id) enables the live compatibility note. `actions: false` shows the card
 * for inspection only (the hangar prompt already names the key), without the Install / Put back buttons.
 */
export function partInfoCard(part, { assembly = null, installed = false, onInstall = null, onPutBack = null, actions: showActions = true } = {}) {
  const slot = CATEGORIES.indexOf(part.category) + 1;
  const card = documentCard({
    code: part.shortName.toUpperCase().replace(/\s+/g, '-'),
    index: `${pad2(slot)} / ${pad2(CATEGORIES.length)}`,
    label: CATEGORY_LABELS[part.category],
    title: partTitle(part),
    className: 'part-card',
  });
  card.body.append(el('p', 'part-card__text', part.description));

  const key = keyStat(part);
  const stats = el('div', 'stats part-card__stats');
  stats.append(
    statBlock({ label: 'Mass', value: part.mass, unit: 'kg', format: (v) => fmt(v) }),
    statBlock({ label: 'Cost', value: part.cost, unit: '$M', format: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) }),
    statBlock({ label: key.label, value: key.value, unit: key.unit, format: (v) => fmt(v) }),
  );
  card.body.append(stats);

  const lines = infoLines(part).filter((l) => l.label !== 'Mass' && l.label !== 'Cost' && l.label !== key.label && !l.label.startsWith('Power'));
  card.body.append(el('hr', 'rule rule--hair'), specList(lines));

  const compat = assembly ? compatibilityFor(part.id, assembly) : { ok: true };
  if (!compat.ok) {
    const note = el('div', 'part-card__note');
    note.append(icon('blocker', { className: 'part-card__note-icon' }), el('p', '', compat.reason));
    card.body.append(note);
  }

  if (!showActions) return card;
  const actions = el('div', 'btn-row part-card__actions');
  const install = button(installed ? 'Installed' : 'Install', installed ? 'secondary' : 'primary', onInstall, { key: 'E' });
  install.disabled = installed || !compat.ok;
  actions.append(install, button('Put back', installed ? 'primary' : 'secondary', onPutBack, { key: 'Q' }));
  card.body.append(actions);
  return card;
}

/**
 * The two columns of the mission brief: the story on the left, the three hard numbers and the requirements on the
 * right. `stars` turns the requirements into the objectives list, one drawn star each, with the rule for stars.
 */
export function briefBody(mission, { stars: starsMode = false } = {}) {
  const cols = el('div', 'brief__cols');

  const story = el('div', 'brief__story');
  const [lede, ...rest] = mission.brief;
  const closing = rest.pop();
  story.append(el('p', 'brief__lede', lede), ...rest.map((p) => el('p', '', p)), el('p', 'brief__closing', closing));

  const side = el('aside', 'brief__side');
  const stats = el('div', 'brief__stats');
  stats.append(
    statBlock({ label: 'Budget', value: mission.budgetMusd, unit: '$M', large: true }),
    statBlock({ label: 'Capacity', value: mission.capacityKg, unit: 'kg', large: true, format: (v) => fmt(v) }),
    statBlock({ label: 'Goal', value: mission.goalMB, unit: 'MB', large: true, format: (v) => fmt(v) }),
  );
  const reqs = el('ol', `requirements${starsMode ? ' requirements--stars' : ''}`);
  mission.objectives.forEach((o, i) => {
    const li = el('li', 'requirements__item');
    li.append(starsMode ? icon('star', { className: 'requirements__star' }) : el('span', 'requirements__no', pad2(i + 1)));
    const text = el('div', '');
    text.append(el('b', 'requirements__title', o.title), el('p', '', o.text));
    li.append(text);
    reqs.append(li);
  });
  side.append(microLabel('Mission numbers', 'label--quiet'), stats, el('hr', 'rule rule--hair'), microLabel(starsMode ? 'Objectives and stars' : 'Requirements', 'label--quiet'), reqs);
  if (starsMode) side.append(el('p', 'requirements__note', 'Each objective you meet earns one star. Stars only count once the first objective is met.'));

  cols.append(story, side);
  return cols;
}

/** Mission brief document: story, requirements and the three hard numbers. */
export function missionBrief(mission, { onClose = null, onContinue = null } = {}) {
  const card = documentCard({
    code: 'FL-DOC-001', index: '01 / 05', label: `Mission ${mission.satellite}`, title: 'Mission Brief', marks: true, className: 'brief',
  });
  card.body.append(briefBody(mission));
  const actions = el('div', 'btn-row doc__actions');
  actions.append(button('Close', 'ghost', onClose), button('Begin building', 'primary', onContinue, { icon: 'arrow' }));
  card.body.append(actions);
  return card;
}

const count = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** The check's verdict banner: tone by the worst finding, plus the number of blockers / warnings. */
export function verdictBanner(result, { clearedText = 'Cleared for integration', blockedText = 'Not cleared for integration' } = {}) {
  const blockers = result.checks.filter((c) => c.severity === 'blocker').length;
  const warnings = result.checks.filter((c) => c.severity === 'warning').length;
  const tone = blockers ? 'blocker' : warnings ? 'warning' : 'ok';
  const verdict = el('div', `verdict verdict--${tone}`);
  const badge = el('span', 'verdict__badge');
  badge.append(icon(tone === 'ok' ? 'check' : tone, { draw: true }));
  const words = el('div', 'verdict__text');
  words.append(
    el('b', '', blockers ? blockedText : warnings ? `${clearedText}, with warnings` : clearedText),
    el('span', '', [
      blockers ? count(blockers, 'blocker') : null,
      warnings ? count(warnings, 'warning') : null,
      !blockers && !warnings ? 'Nothing to fix' : null,
    ].filter(Boolean).join(' · ')),
  );
  verdict.append(badge, words);
  return verdict;
}

/** Mass and budget meters against the mission limits. */
export function limitMeters(totals, mission) {
  const meters = el('div', 'readiness__meters');
  meters.append(
    meter({ label: 'Launch mass', value: totals.mass, limit: mission.capacityKg, unit: 'kg', format: (v) => fmt(v), limitLabel: `${fmt(mission.capacityKg)} kg capacity` }),
    meter({ label: 'Budget', value: totals.cost, limit: mission.budgetMusd, format: (v) => fmtMusd(Math.round(v * 10) / 10), limitLabel: `${fmtMusd(mission.budgetMusd)} budget` }),
  );
  return meters;
}

const signedW = (v) => `${v < 0 ? '−' : '+'}${fmt(Math.abs(v))} W`;

/** Power and data plan of a complete build as definition rows (warnings use the same limits as the checks). */
export function powerDataSummary(totals, mission) {
  const imaging = totals.loads.base + totals.loads.imaging;
  const downlink = totals.loads.base + totals.loads.downlink;
  const power = specList([
    { label: 'Sunlit power', value: `${fmt(totals.sunlitPowerW)} W` },
    { label: 'Draw while imaging', value: `${fmt(imaging)} W`, tone: imaging > totals.sunlitPowerW ? 'warn' : 'good' },
    { label: 'Draw while downlinking', value: `${fmt(downlink)} W`, tone: downlink > totals.sunlitPowerW ? 'warn' : 'good' },
    { label: 'Average balance per orbit', value: signedW(Math.round(totals.orbitAvgBalanceW)), tone: totals.orbitAvgBalanceW < 0 ? 'warn' : 'good' },
    { label: 'Eclipse reserve', value: `${fmt(totals.batteryWh)} Wh of ${fmt(totals.eclipseNeedWh)} Wh needed`, tone: totals.batteryWh < totals.eclipseNeedWh ? 'warn' : 'good' },
  ]);
  const data = specList([
    { label: 'Memory on board', value: `${fmt(totals.storageMB)} MB`, tone: totals.storageMB < totals.imageryPerOrbitMB ? 'warn' : 'good' },
    { label: 'Imagery per orbit', value: `${fmt(totals.imageryPerOrbitMB)} MB` },
    { label: 'Most that can be collected', value: `${fmt(totals.maxImageryMB)} MB`, tone: totals.maxImageryMB < mission.goalMB ? 'warn' : 'good' },
    { label: 'Most that can be sent', value: `${fmt(totals.maxDownlinkMB)} MB`, tone: totals.maxDownlinkMB < mission.goalMB ? 'warn' : 'good' },
    { label: 'Goal', value: `${fmt(mission.goalMB)} MB` },
  ]);
  const wrap = el('div', 'readiness__summary');
  wrap.append(microLabel('Power', 'label--quiet'), power, microLabel('Data', 'label--quiet'), data);
  return wrap;
}

/** Build sheet rows for a payload: the part in each slot, then launch mass and cost against the limits. */
export function payloadLines(assembly, result, mission) {
  const lines = CATEGORIES.map((c) => {
    const part = getPart(assembly?.[c]);
    return { label: CATEGORY_LABELS[c], value: part ? partTitle(part) : 'Not installed', tone: part ? undefined : 'bad' };
  });
  const { mass, cost } = result.totals;
  lines.push(
    { label: 'Launch mass', value: `${fmt(mass)} kg of ${fmt(mission.capacityKg)} kg`, tone: mass > mission.capacityKg ? 'bad' : 'good' },
    { label: 'Cost', value: `${fmtMusd(Math.round(cost * 10) / 10)} of ${fmtMusd(mission.budgetMusd)}`, tone: cost > mission.budgetMusd ? 'bad' : 'good' },
  );
  return specList(lines);
}

/** Checks ordered blockers, warnings, then the passed ones. */
export const sortChecks = (checks) => [...checks].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

/** Readiness check document for an evaluateAssembly() result. */
export function readinessCheck(result, mission, { onBack = null, onIntegrate = null } = {}) {
  const card = documentCard({
    code: 'FL-DOC-003', index: '03 / 05', label: 'Pre-launch', title: 'Readiness Check', marks: true, className: 'readiness',
  });
  card.body.append(verdictBanner(result), limitMeters(result.totals, mission), el('hr', 'rule'), checklist(sortChecks(result.checks)));

  const actions = el('div', 'btn-row doc__actions');
  const integrate = button('Integrate payload', 'primary', onIntegrate, { icon: 'rocket' });
  integrate.disabled = !result.canIntegrate;
  actions.append(button('Back to stand', 'ghost', onBack), integrate);
  card.body.append(actions);
  return card;
}

const EVENT_ICONS = { target: 'camera', pass: 'signal', eclipse: 'moon' };
const EVENT_NAMES = { target: 'Imaging target', pass: 'Ground pass', eclipse: 'Earth shadow' };
const clock = (minutes) => `T+${pad2(Math.floor(minutes / 60))}:${pad2(Math.floor(minutes % 60))}`;

/**
 * Orbit telemetry HUD (night cards): battery + memory + delivered data, next-event timeline and the mode selector.
 * Returns { telemetry, timeline, modes, update(simState, upcoming) } - mount the three nodes where the layout wants them.
 */
export function orbitHud({ goalMB, modes = ['SUN', 'IMAGE', 'DOWNLINK'], mode = 'SUN', onMode = null }) {
  const telemetry = el('section', 'night hud-card telemetry');
  const head = el('div', 'hud-card__head');
  const time = el('span', 'hud-card__code', clock(0));
  head.append(microLabel('Telemetry'), time);
  const battery = meter({ label: 'Battery', value: 80, max: 100, unit: '%', night: true, low: 20 });
  const memory = meter({ label: 'Memory', value: 0, max: 100, unit: '%', night: true, limit: 90, limitLabel: 'Full 90%' });
  for (const [m, name] of [[battery, 'battery'], [memory, 'memory']]) {
    const label = m.querySelector('.meter__label');
    label.prepend(icon(name, { className: 'meter__icon' }));
  }
  const delivered = statBlock({ label: 'Delivered', value: 0, unit: `of ${fmt(goalMB)} MB`, night: true, large: true, format: (v) => fmt(v) });
  const goal = el('div', 'goalbar');
  goal.append(el('span', 'goalbar__fill'));
  telemetry.append(head, battery, memory, el('hr', 'rule rule--night'), delivered, goal);

  const timeline = el('section', 'night hud-card timeline');
  timeline.append(el('div', 'hud-card__head'));
  timeline.firstChild.append(microLabel('Next events'));
  const list = el('ol', 'timeline__list');
  timeline.append(list);

  const modeBar = el('div', 'night mode-bar');
  const selector = segmented(modes.map((m) => m), mode, onMode, { night: true, keys: modes.map((_, i) => String(i + 1)) });
  modeBar.append(microLabel('Mode'), selector);

  function update(state, upcoming = []) {
    time.textContent = `ORBIT ${state.orbit + 1} · ${clock(state.t)}`;
    battery.set(state.batteryPct);
    memory.set(state.memoryPct);
    delivered.set(state.deliveredMB);
    goal.firstChild.style.transform = `scaleX(${Math.min(1, state.deliveredMB / goalMB)})`;
    if (modes.includes(state.mode)) selector.select(state.mode);
    list.replaceChildren(...upcoming.map((e) => {
      const li = el('li', `timeline__item timeline__item--${e.type}`);
      const dot = el('span', 'timeline__dot');
      dot.append(icon(EVENT_ICONS[e.type]));
      const text = el('div', 'timeline__text');
      text.append(el('b', '', e.type === 'eclipse' ? 'Eclipse' : e.name), el('span', '', `${EVENT_NAMES[e.type]} · ${Math.round(e.end - e.start)} min`));
      li.append(dot, text, el('span', 'timeline__eta', `in ${Math.max(1, Math.round(e.startsIn))} min`));
      return li;
    }));
    stagger(list);
  }
  return { telemetry, timeline, modes: modeBar, selector, update };
}

function bullets(items, iconName) {
  const list = el('ul', `debrief__list${iconName ? ' debrief__list--icon' : ''}`);
  for (const text of items) {
    const li = el('li');
    li.append(iconName ? icon(iconName) : el('span', 'debrief__dot'), el('span', '', text));
    list.append(li);
  }
  return list;
}

/** Debrief document for an analyzeMission() result. */
export function debrief(result, { onRedesign = null, onReplay = null, onMenu = null } = {}) {
  const card = documentCard({ code: 'FL-DOC-005', index: '05 / 05', marks: true, className: 'debrief' });
  const head = el('div', 'debrief__head');
  const title = displayTitle(result.success ? 'Mission Success' : 'Mission Failed', { tag: 'h2', className: 'debrief__title' });
  const left = el('div', 'debrief__result');
  left.append(microLabel('Debrief · LUMEN-1'), title);
  const primaryMet = result.objectives[0].met;
  const row = el('div', 'debrief__stars');
  row.append(stars(result.objectives.map((o) => o.met && primaryMet)));
  if (!primaryMet) row.append(el('p', 'debrief__starnote', 'Stars count once the primary goal is met.'));
  head.append(left, row);

  const objectives = el('ol', 'debrief__objectives');
  for (const o of result.objectives) {
    const li = el('li', `debrief__objective${o.met ? ' is-earned' : ''}`);
    li.append(icon(o.met ? 'check' : 'close', { draw: true }), el('span', '', o.text));
    objectives.append(li);
  }

  const stats = el('div', 'stats debrief__stats');
  stats.append(
    statBlock({ label: 'Delivered', value: result.deliveredMB, unit: 'MB', large: true, format: (v) => fmt(v) }),
    statBlock({ label: 'Goal', value: result.goalMB, unit: 'MB', large: true, format: (v) => fmt(v) }),
    statBlock({ label: 'Data lost', value: result.dataLostMB, unit: 'MB', large: true, format: (v) => fmt(v) }),
    statBlock({ label: 'Safe modes', value: result.safeModeCount, large: true }),
  );

  const columns = el('div', 'debrief__cols');
  const section = (label, node) => {
    const s = el('section', 'debrief__section');
    s.append(microLabel(label, 'label--quiet'), node);
    return s;
  };
  columns.append(
    section('What happened', bullets(result.reasons)),
    section('What went well', bullets(result.positives, 'check')),
    section('Try next time', bullets(result.suggestions.length ? result.suggestions : ['Nothing to change. Try a cheaper build for a bigger challenge.'], 'arrow')),
  );

  const actions = el('div', 'btn-row doc__actions');
  actions.append(button('Main menu', 'ghost', onMenu), button('Replay intro', 'secondary', onReplay), button('Redesign', 'primary', onRedesign, { icon: 'arrow' }));
  card.body.append(head, el('hr', 'rule'), objectives, el('hr', 'rule rule--hair'), stats, el('hr', 'rule'), columns, actions);
  return card;
}
