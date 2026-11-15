// UI kit: every Flight Manual component and state, built with the game's own modules. Visual contract for all later tickets.
import { el } from '../src/ui/dom.js';
import { icon, ICON_NAMES } from '../src/ui/icons.js';
import {
  button, displayTitle, keyCap, microLabel, slider, sliderRow, toggleRow, toggle, segmented, segmentedRow, statBlock, meter,
  checklist, stars,
} from '../src/ui/components.js';
import { partInfoCard, missionBrief, readinessCheck, orbitHud, debrief } from '../src/ui/panels.js';
import { stagger } from '../src/ui/motion.js';
import { UI, modalCard } from '../src/core/ui.js';
import { settingsForm } from '../src/core/menus.js';
import { getPart } from '../src/data/components.js';
import { mission } from '../src/data/mission.js';
import { presets } from '../src/data/presets.js';
import { evaluateAssembly } from '../src/sim/assembly.js';
import { createOrbitSim } from '../src/sim/orbit.js';
import { policies, runPolicy } from '../src/sim/policies.js';
import { fmt } from '../src/data/format.js';

const kit = document.getElementById('kit');
const params = new URLSearchParams(location.search);

function section(id, label, title, note = '') {
  const node = el('section', 'kit-section');
  node.id = id;
  const head = el('header', 'kit-section__head');
  head.append(microLabel(label), displayTitle(title, { tag: 'h2' }));
  node.append(head);
  if (note) node.append(el('p', 'kit-section__note', note));
  kit.append(node);
  return node;
}

/* ---------- Hero ---------- */
{
  const hero = el('header', 'kit-hero');
  hero.append(
    el('span', 'code', 'FL-UI-KIT · Visual contract'),
    displayTitle('Flight Manual', { tag: 'h1' }),
    el('div', 'kit-hero__rule'),
    el('p', '', 'Printed mission documents laid over the 3D world: warm paper, black ink, one signal red. Every component and state of the interface, built from the same CSS and modules as the game.'),
  );
  kit.append(hero);
}

/* ---------- 1. Foundations ---------- */
{
  const s = section('foundations', '01', 'Design Foundations');
  const card = el('div', 'paper sheet');
  const left = el('div', 'sheet__col');
  left.append(microLabel('Palette'));
  const tokens = [
    ['--paper', '#F1ECE2'], ['--paper-2', '#E7E0D3'], ['--ink', '#1B1B1B'], ['--ink-2', '#5A5650'],
    ['--ink-3', '#8C867C'], ['--signal', '#D8382C'], ['--signal-ink', '#A92A20'], ['--blue', '#2E5AAC'],
    ['--amber', '#D98A12'], ['--green', '#2F8F5B'], ['--night', 'rgba(20,23,29,.84)'], ['--night-line', 'rgba(241,236,226,.16)'],
  ];
  const grid = el('div', 'swatches');
  for (const [name, value] of tokens) {
    const sw = el('div', 'swatch');
    const chip = el('div', 'swatch__chip');
    chip.style.background = name.startsWith('--night') ? `linear-gradient(135deg, #1d2430, #0b0e13), ${value}` : `var(${name})`;
    if (name === '--night-line') chip.style.background = '#14171d';
    if (name === '--night-line') chip.style.boxShadow = 'inset 0 0 0 5px rgba(241,236,226,.16)';
    sw.append(chip, el('b', '', name), el('span', '', value));
    grid.append(sw);
  }
  left.append(grid);

  const right = el('div', 'sheet__col specimen');
  right.append(microLabel('Type'));
  const display = el('div', 'specimen__display');
  display.append('Aa ', el('em', '', 'Italic'));
  const line = (name, sample, cls = '') => {
    const row = el('div', 'specimen__line');
    row.append(el('span', '', name), el('b', cls, sample));
    return row;
  };
  right.append(
    display,
    line('Instrument Serif · titles 34-64 px, italic second word', 'Mission Brief'),
    line('Inter 400-700 · body 17 px, tabular numbers', '2 400 MB · $38 M'),
    line('IBM Plex Mono 500 · codes only', 'LUMEN-1  T+00:42', 'specimen__mono'),
    line('Micro label · Inter 600, 12-13 px, 0.12em', 'Section 03 / 05'),
  );
  card.append(left, right);
  s.append(card);
}

/* ---------- 2. Controls ---------- */
{
  const s = section('controls', '02', 'Core Controls', 'Buttons, key caps, sliders, toggles, segmented controls, stat blocks and meters. Hover, pressed and focus states are forced with classes so they can be seen side by side; they behave identically on real interaction.');
  const sheet = el('div', 'paper sheet');

  const left = el('div', 'sheet__col');
  left.append(microLabel('Buttons'));
  const grid = el('div', 'btn-grid');
  const states = [['Default', ''], ['Hover', 'is-hover'], ['Pressed', 'is-active'], ['Focus', 'is-focus'], ['Disabled', 'disabled']];
  grid.append(el('span'), ...states.map(([name]) => microLabel(name, 'label--quiet')));
  for (const [name, kind] of [['Primary', 'primary'], ['Secondary', 'secondary'], ['Ghost', 'ghost']]) {
    grid.append(el('span', 'btn-grid__rowname', name));
    for (const [, cls] of states) {
      const b = button(name === 'Primary' ? 'Install' : name === 'Secondary' ? 'Put back' : 'Cancel', kind);
      if (cls === 'disabled') b.disabled = true;
      else if (cls) b.classList.add(cls);
      grid.append(b);
    }
  }
  left.append(grid);
  const extras = el('div', 'kit-inline');
  extras.append(
    button('Begin building', 'primary', null, { icon: 'arrow' }),
    button('Continue', 'primary', null, { key: 'Enter' }),
    button('Settings', 'secondary', null, { icon: 'wrench' }),
    button('Replay intro', 'ghost', null, { icon: 'play' }),
  );
  left.append(extras, el('hr', 'rule rule--hair'));

  left.append(microLabel('Key caps'));
  const caps = el('div', 'kit-inline');
  const night = el('span', 'night hint-chip');
  night.append(keyCap('E', { night: true }), keyCap('Q', { night: true }), keyCap('Shift', { night: true }), el('span', '', 'on night cards'));
  caps.append(keyCap('E'), keyCap('Q'), keyCap('1'), keyCap('Space'), keyCap('Esc'), night);
  left.append(caps, el('hr', 'rule rule--hair'));

  left.append(microLabel('Stat blocks'));
  const stats = el('div', 'stats');
  stats.append(
    statBlock({ label: 'Mass', value: 24, unit: 'kg' }),
    statBlock({ label: 'Power', value: 290, unit: 'W' }),
    statBlock({ label: 'Data rate', value: 160, unit: 'MB/min' }),
    statBlock({ label: 'Goal', value: 2400, unit: 'MB', large: true, format: (v) => fmt(v) }),
  );
  left.append(stats);

  left.append(el('hr', 'rule rule--hair'), microLabel('Meters'));
  const meters = el('div', 'kit-stack');
  meters.append(
    meter({ label: 'Launch mass', value: 98, limit: 180, unit: 'kg', limitLabel: '180 kg capacity' }),
    meter({ label: 'Near the limit', value: 168, limit: 180, unit: 'kg', limitLabel: '180 kg capacity' }),
    meter({ label: 'Over the limit', value: 204, limit: 180, unit: 'kg', limitLabel: '180 kg capacity' }),
  );
  left.append(meters);


  const right = el('div', 'sheet__col');
  right.append(microLabel('Sliders and toggles'));
  const stack = el('div', 'kit-stack');
  stack.append(
    sliderRow('Master', { min: 0, max: 1, step: 0.01, value: 0.8, format: (v) => `${Math.round(v * 100)}%`, onInput() {} }),
    sliderRow('Music', { min: 0, max: 1, step: 0.01, value: 0.35, format: (v) => `${Math.round(v * 100)}%`, onInput() {} }),
    sliderRow('Sensitivity', { min: 0.2, max: 3, step: 0.05, value: 1.7, format: (v) => `${v.toFixed(2)}x`, onInput() {} }),
  );
  const focused = slider({ min: 0, max: 1, step: 0.01, value: 0.55 });
  focused.classList.add('is-focus');
  const focusRow = el('div', 'row row--slider');
  focusRow.append(el('span', 'row__label', 'Focus ring'), focused, el('span', 'row__value', '55%'));
  stack.append(focusRow, toggleRow('Subtitles', true, () => {}), toggleRow('Invert Y', false, () => {}));
  const tf = toggle(true, () => {});
  tf.classList.add('is-focus');
  const tfRow = el('div', 'row row--toggle');
  tfRow.append(el('span', 'row__label', 'Focus ring'), tf);
  stack.append(tfRow);
  right.append(stack, el('hr', 'rule rule--hair'), microLabel('Segmented control'));
  const segs = el('div', 'kit-stack');
  segs.append(
    segmentedRow('Quality', ['low', 'high'], 'high', () => {}),
    segmentedRow('Units', ['Metric', 'Imperial', 'Both'], 'Metric', () => {}),
  );
  right.append(segs);

  const dark = el('div', 'night kit-night');
  dark.append(microLabel('Night variant (HUD cards)'));
  const row = el('div', 'kit-inline');
  row.append(button('Resume', 'primary'), button('Settings', 'secondary'), button('Menu', 'ghost'));
  const nightControls = el('div', 'kit-stack');
  nightControls.append(
    segmented(['SUN', 'IMAGE', 'DOWNLINK'], 'IMAGE', () => {}, { night: true, keys: ['1', '2', '3'] }),
    sliderRow('Volume', { min: 0, max: 1, step: 0.01, value: 0.7, format: (v) => `${Math.round(v * 100)}%`, onInput() {} }),
    meter({ label: 'Battery', value: 62, max: 100, unit: '%', night: true, low: 20 }),
    meter({ label: 'Battery low', value: 14, max: 100, unit: '%', night: true, low: 20 }),
  );
  const nightStats = el('div', 'stats');
  nightStats.append(statBlock({ label: 'Delivered', value: 1240, unit: 'MB', night: true, large: true, format: (v) => fmt(v) }), statBlock({ label: 'Orbit', value: 2, unit: 'of 3', night: true, large: true }));
  dark.append(row, nightControls, nightStats);
  right.append(dark);

  sheet.append(left, right);
  s.append(sheet);
}

/* ---------- 3. Checklist and icons ---------- */
{
  const s = section('status', '03', 'Status and Icons', 'Status is never colour alone: every row carries a drawn line icon and a word. Checkmarks draw their stroke when a row appears.');
  const row = el('div', 'kit-docs');
  const rows = el('div', 'paper');
  rows.append(microLabel('Checklist rows', 'doc__label'));
  rows.append(checklist([
    { severity: 'ok', title: 'Compatibility', detail: 'Every part fits the bus.' },
    { severity: 'warning', title: 'Power budget is negative', detail: 'The array makes less than the satellite uses in a typical orbit.', fix: 'Choose a bigger solar array or a lighter instrument.' },
    { severity: 'blocker', title: 'Over budget', detail: 'The parts cost $44 M but the budget is $38 M.', fix: 'Swap the X-Band Dish for the S-Band Patch, saving $4 M.' },
    { severity: 'info', title: 'Note', detail: 'Information rows use the blue accent.' },
  ]));
  const icons = el('div', 'paper');
  icons.append(microLabel('Line icons · 1.75 px stroke, round caps', 'doc__label'));
  const grid = el('div', 'icon-grid');
  for (const name of ICON_NAMES) {
    const cell = el('div', 'icon-cell');
    cell.append(icon(name), el('span', '', name));
    grid.append(cell);
  }
  icons.append(grid, el('hr', 'rule rule--hair'), microLabel('Stars', 'doc__label'));
  const starRow = el('div', 'kit-inline');
  starRow.append(stars(3), stars(2), stars(0));
  icons.append(starRow);
  row.append(rows, icons);
  s.append(row);
}

/* ---------- 4. Documents ---------- */
{
  const s = section('parts', '04', 'Part Info Card', 'Shown at a rack or on the integration stand. Values come straight from the component catalog; the second card shows the compatibility blocker.');
  const row = el('div', 'kit-row');
  row.append(
    partInfoCard(getPart('inst_hri'), { assembly: presets.balanced, onInstall() {}, onPutBack() {} }),
    partInfoCard(getPart('ant_xband'), { assembly: { bus: 'bus_micro' } }),
    partInfoCard(getPart('bat_400'), { assembly: presets.balanced, installed: true }),
  );
  s.append(row);
}

{
  const s = section('brief', '05', 'Mission Brief', 'Console document with print furniture: index number, document code and registration marks.');
  s.append(missionBrief(mission));
}

{
  const s = section('readiness', '06', 'Readiness Check', 'Real output of evaluateAssembly for the presets fastlink, underpowered and overbudget (blockers, fix hints and the over-limit meter).');
  const row = el('div', 'kit-docs');
  for (const name of ['fastlink', 'underpowered', 'overbudget']) {
    row.append(readinessCheck(evaluateAssembly(presets[name], mission), mission));
  }
  s.append(row);
}

/* ---------- 5. HUD ---------- */
const hudSim = createOrbitSim(presets.fastlink, mission);
function flyTo(minutes) {
  while (hudSim.state.t < minutes && !hudSim.state.done) {
    hudSim.setMode(policies.smart(hudSim.state, hudSim));
    hudSim.step(0.25);
  }
}
{
  const s = section('orbit-hud', '07', 'Orbit Telemetry', 'Night cards: battery, memory, delivered data, the next four events from the simulation and the mode selector (keys 1 / 2 / 3). Press play to fly the mission with the smart policy and watch the meters ease and the numbers count.');
  const stage = el('div', 'stage');
  stage.append(el('div', 'stage-sat'));
  const hud = orbitHud({ goalMB: mission.goalMB, mode: 'SUN', onMode: (m) => hudSim.setMode(m) });
  const stageUi = new UI(stage, el('div'), null, { fade: false });
  stage.append(hud.telemetry, hud.timeline, hud.modes);
  stageUi.setSubtitle('Ground station Svalbard in range. Switch to downlink to send the imagery home.');
  stage.append(el('span', 'stage__caption', 'Orbit · placeholder world'));
  flyTo(38);
  const refresh = () => hud.update(hudSim.state, hudSim.upcoming(4));
  refresh();

  let timer = null;
  const play = button('Play demo', 'secondary', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.querySelector('.btn__label').textContent = 'Play demo';
      return;
    }
    play.querySelector('.btn__label').textContent = 'Pause demo';
    timer = setInterval(() => {
      flyTo(hudSim.state.t + 3);
      refresh();
      if (hudSim.state.done) { clearInterval(timer); timer = null; }
    }, 650);
  }, { icon: 'play' });
  const controls = el('div', 'stage-controls on-dark');
  controls.append(play);
  s.append(stage, controls);
}

{
  const s = section('world-hud', '08', 'Hangar HUD', 'Objective tracker, interaction prompt, toasts, crosshair and subtitles over the hangar. Buttons spawn real toasts; the tracker checks off with a drawn stroke.');
  const stage = el('div', 'stage stage--hangar');
  const ui = new UI(stage, el('div'), null, { fade: false });
  const items = [
    { text: 'Read the mission brief', done: true },
    { text: 'Install the bus and four parts', done: false },
    { text: 'Run the readiness check', done: false },
  ];
  ui.setObjective('Build LUMEN-1', items);
  ui.showPrompt('E', 'Pick up', 'HRI-5 Imager');
  ui.showCrosshair(true);
  ui.setSubtitle('Check the numbers before you integrate. Every kilogram counts.');
  ui.toast('Part installed', { kind: 'ok', ms: 1e9, detail: 'HRI-5 Imager is on the stand.' });
  ui.toast('Battery cannot cover the eclipse', { kind: 'warn', ms: 1e9 });
  ui.toast('Over budget by $6 M', { kind: 'error', ms: 1e9 });
  ui.toast('Pick up parts with E', { ms: 1e9 });
  stage.append(el('span', 'stage__caption', 'Hangar · placeholder world'));

  const controls = el('div', 'stage-controls on-dark');
  let done = 1;
  controls.append(
    button('Check off next objective', 'secondary', () => {
      done = (done % items.length) + 1;
      ui.setObjective('Build LUMEN-1', items.map((it, i) => ({ ...it, done: i < done })));
    }, { icon: 'check' }),
    button('Toast', 'secondary', () => ui.toast('Part installed', { kind: 'ok' })),
    button('Warning', 'secondary', () => ui.toast('Battery cannot cover the eclipse', { kind: 'warn' })),
    button('Error', 'secondary', () => ui.toast('Over budget by $6 M', { kind: 'error' })),
  );
  s.append(stage, controls);
}

/* ---------- 6. Debrief ---------- */
{
  const s = section('debrief', '09', 'Mission Debrief', 'Real analyzeMission results: a three-star flight and a failed flight, with the reasons, what went well and what to try next.');
  const good = runPolicy(createOrbitSim(presets.balanced, mission), policies.smart).result();
  const bad = runPolicy(createOrbitSim(presets.underpowered, mission), policies.careless).result();
  s.append(debrief(good), debrief(bad));
}

/* ---------- 7. Menus and loading ---------- */
{
  const s = section('menus', '10', 'Menus and Loading', 'The pause menu, the settings sheet and the loading card, exactly as the game renders them.');
  const row = el('div', 'kit-static kit-menu');
  row.append(modalCard({
    title: 'Mission Paused', label: 'Flight manual', code: 'FL-MENU-01', hint: 'Esc',
    actions: [
      { label: 'Resume', kind: 'primary' }, { label: 'Settings', kind: 'secondary' },
      { label: 'Restart mission', kind: 'secondary' }, { label: 'Main menu', kind: 'ghost' },
    ],
  }));
  const loading = new UI(el('div'), el('div'), null, { fade: false });
  loading.setLoadingProgress(0.62);
  const wrap = el('div', 'kit-loading');
  wrap.append(loading.loadingEl.firstChild);
  row.append(wrap);
  s.append(row);

  const settings = el('div', 'kit-static kit-menu kit-menu--settings');
  settings.append(modalCard({
    title: 'Flight Settings', label: 'Preferences', code: 'FL-MENU-02', hint: 'Esc', wide: true, layout: 'row',
    content: settingsForm(), actions: [{ label: 'Close', kind: 'primary' }],
  }));
  s.append(settings);
}

const only = params.get('section'); // screenshot aid: ?section=<id> shows a single section
if (only) {
  kit.querySelector('.kit-hero').hidden = !only.startsWith('hero');
  for (const node of kit.querySelectorAll('.kit-section')) node.hidden = node.id !== only;
}
stagger(kit.querySelector('.kit-hero'));
document.body.dataset.height = String(document.documentElement.scrollHeight);
