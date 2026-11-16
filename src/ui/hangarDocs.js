// Documents of the two hangar desks, built from the Flight Manual components over plain data (no scene code):
// the Mission Console (three sections: brief, readiness check, integrate) and the Launch Control card.
import { el } from './dom.js';
import { stagger } from './motion.js';
import { button, checklist, displayTitle, documentCard, microLabel } from './components.js';
import { evaluateAssembly } from '../sim/assembly.js';
import { briefBody, limitMeters, payloadLines, powerDataSummary, sortChecks, verdictBanner } from './panels.js';

export const CONSOLE_TABS = [
  { id: 'brief', no: '01', label: 'Mission brief', title: 'Mission Brief', code: 'FL-DOC-001', index: '01 / 05' },
  { id: 'readiness', no: '02', label: 'Readiness check', title: 'Readiness Check', code: 'FL-DOC-003', index: '03 / 05' },
  { id: 'integrate', no: '03', label: 'Integrate', title: 'Integrate Payload', code: 'FL-DOC-003', index: '03 / 05' },
];

const count = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const paragraph = (text, className = '') => el('p', `console__text ${className}`.trim(), text);

function section(label, ...nodes) {
  const node = el('section', 'console__section');
  node.append(microLabel(label, 'label--quiet'), ...nodes);
  return node;
}

function twoColumns(left, right) {
  const cols = el('div', 'console__cols');
  const a = el('div', 'console__col');
  const b = el('div', 'console__col');
  a.append(...left);
  b.append(...right);
  cols.append(a, b);
  return cols;
}

/** Readiness section: verdict and meters (with the power and data plan) beside the checklist. */
function readinessSection(result, mission) {
  const complete = !result.checks.some((c) => c.id.startsWith('missing_'));
  const left = [verdictBanner(result), limitMeters(result.totals, mission)];
  if (complete) left.push(el('hr', 'rule rule--hair'), powerDataSummary(result.totals, mission));
  return twoColumns(left, [checklist(sortChecks(result.checks))]);
}

/** Integrate section: what goes up, and what the verdict means for the button. */
function integrateSection(result, mission, assembly, integrated) {
  const warnings = result.checks.filter((c) => c.severity === 'warning');
  const blockers = result.checks.filter((c) => c.severity === 'blocker');
  const right = [];
  if (integrated) {
    right.push(
      section('Status', paragraph('LUMEN-1 is mated to the top of the rocket and sealed under the fairing.'),
        paragraph('Walk to Launch Control and begin the countdown.')),
    );
  } else if (blockers.length) {
    right.push(section('Fix before integrating', paragraph(`${count(blockers.length, 'blocker')} ${blockers.length > 1 ? 'stop' : 'stops'} the satellite from going on the rocket.`), checklist(blockers)));
  } else {
    right.push(section('What happens next',
      paragraph('The crane lifts LUMEN-1 off the stand and lowers it onto the payload adapter. The two fairing halves close around it, and the crane carries the sealed payload up to the top of the rocket.'),
      paragraph(warnings.length
        ? `The build has ${count(warnings.length, 'warning')}. It can still fly, and you will be asked to confirm before the crane starts.`
        : 'Every check passed. After integration the build is sealed until the mission is over.')));
  }
  return twoColumns([verdictBanner(result, { clearedText: integrated ? 'Payload integrated' : 'Cleared for integration' }), section('Payload', payloadLines(assembly, result, mission))], right);
}

/** Second confirmation: the warnings in plain words. */
function confirmSection(result) {
  const warnings = result.checks.filter((c) => c.severity === 'warning');
  const head = el('div', 'console__confirm');
  head.append(
    microLabel('Please confirm'),
    displayTitle(`Integrate with ${count(warnings.length, 'warning')}?`, { tag: 'h3', className: 'console__confirm-title' }),
    paragraph('The satellite will fly as built. These are the risks the readiness check found:'),
    checklist(warnings),
    paragraph('Once the crane starts, the build is sealed. The debrief will show how these risks played out.', 'console__fine'),
  );
  return head;
}

/**
 * The Mission Console document. Returns { card, setTab(id), refresh(), get tab }.
 * state: { mission, getAssembly(), isIntegrated() }; handlers: { onBack(), onIntegrate(), onTab(id) when a section is shown }.
 */
export function missionConsole({ mission, getAssembly, isIntegrated }, { onBack, onIntegrate, onTab = null }) {
  const card = documentCard({ code: CONSOLE_TABS[0].code, index: CONSOLE_TABS[0].index, marks: true, className: 'console' });
  const code = card.querySelector('.doc__code');
  const index = card.querySelector('.doc__index');
  const heading = el('div', 'console__heading');
  const tabs = el('nav', 'doc-tabs');
  tabs.setAttribute('role', 'tablist');
  const scroll = el('div', 'console__scroll');
  const foot = el('div', 'btn-row doc__actions console__foot');
  const title = el('div', 'console__title');
  heading.append(title, microLabel(`Mission console · ${mission.satellite}`));
  card.body.append(heading, tabs, scroll, foot);

  let current = 'brief';
  let confirming = false;
  const buttons = new Map();
  for (const tab of CONSOLE_TABS) {
    const b = el('button', 'doc-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.append(el('span', 'doc-tab__no', tab.no), el('span', 'doc-tab__label', tab.label));
    b.addEventListener('click', () => api.setTab(tab.id));
    tabs.append(b);
    buttons.set(tab.id, b);
  }

  const goto = (id) => () => api.setTab(id);
  const render = () => {
    const tab = CONSOLE_TABS.find((t) => t.id === current);
    const assembly = getAssembly();
    const result = evaluateAssembly(assembly, mission);
    const integrated = isIntegrated();
    code.textContent = tab.code;
    index.textContent = tab.index;
    title.replaceChildren(displayTitle(tab.title, { tag: 'h2', className: 'console__display' }));
    for (const [id, b] of buttons) {
      b.classList.toggle('is-active', id === current);
      b.setAttribute('aria-selected', String(id === current));
    }

    let body;
    const actions = [button('Back to stand', 'ghost', onBack, { key: 'Esc' })];
    if (current === 'brief') {
      body = briefBody(mission, { stars: true });
      actions.push(button('Check readiness', 'primary', goto('readiness'), { icon: 'arrow' }));
    } else if (current === 'readiness') {
      body = readinessSection(result, mission);
      actions.push(button('Continue to integration', 'primary', goto('integrate'), { icon: 'arrow' }));
    } else if (confirming) {
      body = confirmSection(result);
      actions[0] = button('Go back and fix', 'ghost', () => { confirming = false; render(); });
      actions.push(button('Integrate anyway', 'primary', onIntegrate, { icon: 'rocket' }));
    } else {
      body = integrateSection(result, mission, assembly, integrated);
      const hasWarnings = result.checks.some((c) => c.severity === 'warning');
      const integrate = button('Integrate payload', 'primary', hasWarnings ? () => { confirming = true; render(); } : onIntegrate, { icon: 'rocket' });
      integrate.disabled = !result.canIntegrate || integrated;
      actions.push(integrate);
    }
    body.classList.add('enter');
    scroll.replaceChildren(body);
    scroll.scrollTop = 0;
    foot.replaceChildren(...actions);
    return result;
  };

  const api = {
    card,
    get tab() { return current; },
    get confirming() { return confirming; },
    setTab(id) {
      if (!CONSOLE_TABS.some((t) => t.id === id)) throw new Error(`Unknown console tab: ${id}`);
      current = id;
      confirming = false;
      const result = render();
      onTab?.(id);
      return result;
    },
    /** Redraw from the live assembly (the build can change while the console is shut, never while open). */
    refresh: render,
  };
  api.setTab('brief');
  return api;
}

/** The compact Launch Control card: the payload's build sheet and verdict, and the one button that starts the launch. */
export function launchControlCard(assembly, mission, { onBegin, onBack }) {
  const result = evaluateAssembly(assembly, mission);
  const card = documentCard({
    code: 'FL-DOC-004', index: '04 / 05', label: `Launch · ${mission.satellite}`, title: 'Launch Control', marks: true, className: 'launch-card',
  });
  const orbit = mission.orbit;
  card.body.append(
    verdictBanner(result, { clearedText: 'Cleared for launch' }),
    section('Payload', payloadLines(assembly, result, mission)),
    paragraph(`Target: ${orbit.altitudeKm} km sun-synchronous orbit, ${orbit.orbits} orbits to deliver the imagery.`, 'launch-card__note'),
  );
  const actions = el('div', 'btn-row doc__actions');
  actions.append(button('Not yet', 'ghost', onBack, { key: 'Esc' }), button('Begin countdown', 'primary', onBegin, { icon: 'rocket' }));
  card.body.append(actions);
  stagger(card.body);
  return card;
}
