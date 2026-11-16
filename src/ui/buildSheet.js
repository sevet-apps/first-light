// Build sheet: the hangar HUD card (night variant) that follows the satellite on the stand.
// Slot rows, mass and cost meters against the mission limits, power and data lines. While a part is carried
// the lines show the change it would cause. Everything animates when a value changes (count-up, meter easing).
import { el } from './dom.js';
import { icon } from './icons.js';
import { countTo } from './motion.js';
import { displayTitle, meter, microLabel } from './components.js';
import { CATEGORIES, CATEGORY_LABELS, getPart } from '../data/components.js';
import { fmt, fmtMusd } from '../data/format.js';
import { evaluateAssembly } from '../sim/assembly.js';

const SLOT_ICONS = { bus: 'satellite', avionics: 'memory', attitude: 'satellite', instrument: 'camera', solar: 'sun', battery: 'battery', antenna: 'signal' };
const NBSP = ' ';
const round1 = (v) => Math.round(v * 10) / 10;

/** The numbers the sheet shows for an assembly {category: partId}. */
export function sheetFigures(assembly, mission) {
  const { totals } = evaluateAssembly(assembly, mission);
  return {
    mass: totals.mass,
    cost: totals.cost,
    sunW: totals.sunlitPowerW,
    imagingW: totals.loads.base + totals.loads.imaging,
    downlinkW: totals.loads.base + totals.loads.downlink,
    storageMB: totals.storageMB,
    linkMBmin: getPart(assembly?.antenna)?.stats.rateMBmin ?? 0,
  };
}

/** Change `partId` would cause when it takes the place of whatever sits in its slot: figures(after) - figures(now). */
export function sheetDelta(assembly, partId, mission) {
  const part = getPart(partId);
  const now = sheetFigures(assembly, mission);
  const after = sheetFigures({ ...assembly, [part.category]: partId }, mission);
  return { now, after, change: Object.fromEntries(Object.keys(now).map((k) => [k, round1(after[k] - now[k])])) };
}

const signed = (v, text) => `${v < 0 ? '−' : '+'}${text}`;

// key: figure id; format(v): number text; unit shown after it.
const LINES = [
  { key: 'sunW', label: 'Sunlit power', unit: 'W', format: (v) => fmt(v), delta: (v) => signed(v, `${fmt(Math.abs(v))} W`) },
  { key: 'imagingW', label: 'Imaging draw', unit: 'W', format: (v) => fmt(v), delta: (v) => signed(v, `${fmt(Math.abs(v))} W draw`), draw: true },
  { key: 'downlinkW', label: 'Downlink draw', unit: 'W', format: (v) => fmt(v), delta: (v) => signed(v, `${fmt(Math.abs(v))} W draw`), draw: true },
  { key: 'storageMB', label: 'Storage', unit: 'MB', format: (v) => fmt(v), delta: (v) => signed(v, `${fmt(Math.abs(v))} MB`) },
  { key: 'linkMBmin', label: 'Downlink rate', unit: 'MB/min', format: (v) => fmt(v), delta: (v) => signed(v, `${fmt(Math.abs(v))} MB/min`) },
];

const deltaNode = () => {
  const node = el('span', 'sheet__delta');
  node.hidden = true;
  return node;
};

function showDelta(node, text, over = false) {
  node.hidden = !text;
  node.textContent = text ?? '';
  node.classList.toggle('is-over', over);
}

/** Meter with a delta chip next to its readout. */
function sheetMeter(options) {
  const m = meter({ ...options, night: true });
  const readout = m.querySelector('.meter__value');
  const group = el('span', 'sheet__readout');
  const chip = deltaNode();
  readout.replaceWith(group);
  group.append(chip, readout);
  m.chip = chip;
  return m;
}

/**
 * Build the sheet card. Returns { node, set(assembly), setDelta(delta | null, category), setCompact(bool), flash(category) }.
 * `figures` are produced by sheetFigures(); the card never evaluates the mission itself.
 */
export function buildSheet(mission, initial) {
  const node = el('section', 'night sheet enter');
  node.setAttribute('aria-label', 'LUMEN-1 build sheet');

  const head = el('header', 'sheet__head');
  head.append(microLabel('Build sheet'), el('span', 'sheet__code', 'FL-DOC-002'));
  const title = displayTitle('LUMEN-1 build sheet', { tag: 'h2', className: 'sheet__title' });

  const slots = el('ul', 'sheet__slots');
  const rows = {};
  for (const cat of CATEGORIES) {
    const li = el('li', 'sheet__slot');
    const badge = el('span', 'sheet__badge');
    badge.append(icon(SLOT_ICONS[cat]));
    const name = el('span', 'sheet__name', '—');
    li.append(badge, el('span', 'sheet__cat', CATEGORY_LABELS[cat]), name);
    slots.append(li);
    rows[cat] = { li, name };
  }

  const massMeter = sheetMeter({
    label: 'Mass', value: initial.mass, limit: mission.capacityKg, unit: 'kg', format: (v) => fmt(Math.round(v)), limitLabel: `${fmt(mission.capacityKg)} kg limit`,
  });
  const costMeter = sheetMeter({
    label: 'Cost', value: initial.cost, limit: mission.budgetMusd, format: (v) => fmtMusd(round1(v)), limitLabel: `${fmtMusd(mission.budgetMusd)} budget`,
  });
  const meters = el('div', 'sheet__meters');
  meters.append(massMeter, costMeter);

  const list = el('dl', 'sheet__lines');
  const lines = {};
  for (const line of LINES) {
    const row = el('div', 'sheet__line');
    const value = el('span', 'sheet__num');
    value.dataset.value = String(initial[line.key]);
    value.textContent = line.format(initial[line.key]);
    const cell = el('dd', 'sheet__value');
    const chip = deltaNode();
    cell.append(chip, value, el('span', 'sheet__unit', `${NBSP}${line.unit}`));
    row.append(el('dt', 'sheet__label', line.label), cell);
    list.append(row);
    lines[line.key] = { line, value, chip };
  }

  const more = el('div', 'sheet__more');
  const moreInner = el('div', 'sheet__more-inner');
  moreInner.append(el('hr', 'rule rule--night'), meters, el('hr', 'rule rule--night'), list);
  more.append(moreInner);
  node.append(head, title, slots, more);

  const api = {
    node,

    /** Animate the sheet to `assembly` ({category: partId}) and its figures. */
    set(assembly, figures) {
      for (const cat of CATEGORIES) {
        const part = getPart(assembly[cat]);
        const row = rows[cat];
        row.li.classList.toggle('is-filled', !!part);
        row.name.textContent = part ? part.shortName : '—';
      }
      massMeter.set(figures.mass);
      costMeter.set(figures.cost);
      for (const { line, value } of Object.values(lines)) countTo(value, figures[line.key], { format: line.format });
    },

    /** Show what carrying a part would change (`delta` from sheetDelta), or clear it with null. */
    setDelta(delta, category = null) {
      for (const cat of CATEGORIES) rows[cat].li.classList.toggle('is-target', cat === category);
      if (!delta) {
        for (const chip of [massMeter.chip, costMeter.chip, ...Object.values(lines).map((l) => l.chip)]) showDelta(chip, null);
        return;
      }
      const { change, after } = delta;
      showDelta(massMeter.chip, change.mass ? signed(change.mass, `${fmt(Math.abs(change.mass))} kg`) : null, after.mass > mission.capacityKg);
      showDelta(costMeter.chip, change.cost ? signed(change.cost, fmtMusd(Math.abs(change.cost))) : null, after.cost > mission.budgetMusd);
      for (const { line, chip } of Object.values(lines)) {
        const v = change[line.key];
        // A draw that the sunlit power cannot cover is flagged.
        showDelta(chip, v ? line.delta(v) : null, !!line.draw && v > 0 && after[line.key] > after.sunW);
      }
    },

    /** Compact mode keeps only the slot rows (used while an info card needs the right edge). */
    setCompact(compact) {
      node.classList.toggle('is-compact', compact);
    },

    flash(category) {
      const li = rows[category].li;
      li.classList.remove('is-flash');
      void li.offsetWidth;
      li.classList.add('is-flash');
    },
  };
  api.set({}, initial);
  return api;
}
