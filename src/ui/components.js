// Flight Manual components (UI_STYLE section 5). Each builder returns a DOM node; styling lives in css/components.css.
import { el } from './dom.js';
import { icon } from './icons.js';
import { sfx } from './sfx.js';
import { countTo, stagger } from './motion.js';

const SEVERITY = {
  ok: { icon: 'check', word: 'OK' },
  warning: { icon: 'warning', word: 'Warning' },
  blocker: { icon: 'blocker', word: 'Blocker' },
  info: { icon: 'info', word: 'Note' },
};

/** Display title with the italic signature: "Mission Brief" -> Mission <em>Brief</em>. */
export function displayTitle(text, { tag = 'h2', className = '' } = {}) {
  const node = el(tag, `display ${className}`.trim());
  const words = text.trim().split(/\s+/);
  const last = words.pop();
  if (words.length) node.append(`${words.join(' ')} `);
  node.append(el('em', '', last));
  return node;
}

export const microLabel = (text, className = '') => el('span', `label ${className}`.trim(), text);

/** Round-cornered key cap. `night` inverts it for dark HUD cards. */
export function keyCap(text, { night = false } = {}) {
  return el('kbd', `key${night ? ' key--night' : ''}${text.length > 1 ? ' key--wide' : ''}`, text);
}

/** kind: 'primary' | 'secondary' | 'ghost' ('danger' is kept as an alias of ghost). */
export function button(label, kind = 'secondary', onClick = null, { icon: iconName = null, key = null } = {}) {
  const b = el('button', `btn btn--${kind === 'danger' ? 'ghost' : kind}`);
  b.type = 'button';
  b.append(el('span', 'btn__label', label));
  if (iconName) b.append(icon(iconName, { className: 'btn__icon' }));
  if (key) b.append(keyCap(key));
  b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && !b.disabled && sfx('hover'));
  b.addEventListener('click', () => sfx(kind === 'primary' ? 'confirm' : 'press'));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const setFill = (input) => {
  const span = Number(input.max) - Number(input.min);
  input.style.setProperty('--p', `${span ? ((Number(input.value) - Number(input.min)) / span) * 100 : 0}%`);
};

/** Range input with ink fill. */
export function slider({ min, max, step, value, onInput = null }) {
  const input = el('input', 'slider');
  Object.assign(input, { type: 'range', min, max, step, value });
  setFill(input);
  input.addEventListener('input', () => { setFill(input); onInput?.(Number(input.value)); });
  input.addEventListener('change', () => sfx('press'));
  return input;
}

/** Labelled slider row with live value. */
export function sliderRow(label, { min, max, step, value, format = (v) => String(v), onInput }) {
  const row = el('label', 'row row--slider');
  const out = el('span', 'row__value', format(value));
  const input = slider({ min, max, step, value, onInput: (v) => { out.textContent = format(v); onInput?.(v); } });
  row.append(el('span', 'row__label', label), input, out);
  return row;
}

/** Pill toggle (on = signal). */
export function toggle(value, onChange) {
  const wrap = el('span', 'toggle');
  const input = el('input');
  Object.assign(input, { type: 'checkbox', checked: value });
  input.setAttribute('role', 'switch');
  input.addEventListener('change', () => { sfx('press'); onChange?.(input.checked); });
  wrap.append(input, el('span', 'toggle__track'));
  return wrap;
}

export function toggleRow(label, value, onChange) {
  const row = el('label', 'row row--toggle');
  row.append(el('span', 'row__label', label), toggle(value, onChange));
  return row;
}

/** Segmented control with a sliding selection thumb. `night` for dark cards. */
export function segmented(options, value, onChange, { night = false, keys = null } = {}) {
  const group = el('div', `segmented${night ? ' segmented--night' : ''}`);
  group.setAttribute('role', 'radiogroup');
  const thumb = group.appendChild(el('span', 'segmented__thumb'));
  const buttons = options.map((opt, i) => {
    const b = el('button', 'segmented__opt');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    if (keys) b.append(keyCap(keys[i]));
    b.append(el('span', '', opt));
    b.addEventListener('click', () => select(opt, true));
    group.append(b);
    return b;
  });
  let locked = false;
  const place = () => {
    const active = locked ? null : buttons[options.indexOf(value)];
    thumb.style.opacity = active ? '' : '0';
    if (!active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  };
  function select(opt, user) {
    value = opt;
    buttons.forEach((b, i) => {
      const on = !locked && options[i] === opt;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    place();
    if (user) { sfx('press'); onChange?.(opt); }
  }
  select(value, false);
  new ResizeObserver(place).observe(group);
  group.select = (opt) => select(opt, false);
  /** Lock the control (no highlighted option, nothing clickable), e.g. while the spacecraft is in safe mode. */
  group.lock = (on) => {
    if (on === locked) return;
    locked = on;
    group.classList.toggle('is-locked', on);
    buttons.forEach((b) => { b.disabled = on; });
    select(value, false);
  };
  return group;
}

export function segmentedRow(label, options, value, onChange) {
  const row = el('div', 'row row--toggle');
  row.append(el('span', 'row__label', label), segmented(options, value, onChange));
  return row;
}

/** Stat block: micro label, big number, small unit. `.set(v)` counts to a new value. */
export function statBlock({ label, value, unit = '', format = (v) => String(Math.round(v)), night = false, large = false }) {
  const node = el('div', `stat${night ? ' stat--night' : ''}${large ? ' stat--large' : ''}`);
  const num = el('span', 'stat__num', format(value));
  num.dataset.value = String(value);
  const line = el('div', 'stat__value');
  line.append(num);
  if (unit) line.append(el('span', 'stat__unit', unit));
  node.append(el('span', 'label stat__label', label), line);
  node.set = (v) => countTo(num, v, { format });
  return node;
}

/**
 * Meter with a limit tick. value/limit/max share one unit; `max` is the scale end (default limit * 1.25).
 * States (data-state): ok, near (>= 90 % of the limit, or at/below `low`), over (red segment beyond the limit).
 */
export function meter({ label, value, limit = null, max = null, format = (v) => String(Math.round(v)), unit = '', limitLabel = null, night = false, low = null }) {
  const scale = max ?? (limit ? limit * 1.25 : 100);
  const node = el('div', `meter${night ? ' meter--night' : ''}`);
  const head = el('div', 'meter__head');
  const readout = el('span', 'meter__value');
  head.append(el('span', 'meter__label', label), readout);
  const bar = el('div', 'meter__bar');
  const fill = bar.appendChild(el('span', 'meter__fill'));
  const over = bar.appendChild(el('span', 'meter__over'));
  const track = el('div', 'meter__track');
  track.append(bar);
  if (limit) {
    const at = `${(limit / scale) * 100}%`;
    track.append(el('span', 'meter__tick'), el('span', 'meter__tick-label', limitLabel ?? `Limit ${format(limit)}${unit ? ` ${unit}` : ''}`));
    track.lastChild.style.left = at;
    track.lastChild.previousSibling.style.left = at;
    node.classList.add('meter--limit');
  }
  node.append(head, track);

  const text = (v) => `${format(v)}${unit ? ` ${unit}` : ''}`;
  const render = (v) => {
    const cap = limit ?? scale;
    fill.style.width = `${(Math.min(v, cap) / scale) * 100}%`;
    over.style.left = `${(cap / scale) * 100}%`;
    over.style.width = `${(Math.max(0, Math.min(v, scale) - cap) / scale) * 100}%`;
    const near = (limit && v >= limit * 0.9) || (low !== null && v <= low);
    node.dataset.state = limit && v > limit ? 'over' : near ? 'near' : 'ok';
  };
  readout.textContent = text(value);
  readout.dataset.value = String(value);
  render(value);
  node.set = (v) => {
    render(v);
    countTo(readout, v, { format: text });
  };
  return node;
}

/** One readiness-check row: drawn status icon, title, explanation, optional fix hint. */
export function checkRow({ severity = 'ok', title, detail = '', fix = '' }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  const row = el('li', `check-row check-row--${severity}`);
  const badge = el('span', 'check-row__badge');
  badge.append(icon(s.icon, { draw: true }));
  const body = el('div', 'check-row__body');
  const head = el('div', 'check-row__head');
  head.append(el('span', 'check-row__title', title), el('span', 'check-row__tag', s.word));
  body.append(head);
  if (detail) body.append(el('p', 'check-row__detail', detail));
  if (fix) {
    const hint = el('p', 'check-row__fix');
    hint.append(el('b', '', 'Fix'), fix);
    body.append(hint);
  }
  row.append(badge, body);
  return row;
}

/** checks: [{ severity, title, detail, fix }] as produced by evaluateAssembly. */
export function checklist(checks) {
  const list = el('ul', 'checklist');
  for (const c of checks) list.append(checkRow(c));
  return stagger(list);
}

/** Row of drawn stars. `earned` is a count, or an array of booleans (one per star). */
export function stars(earned, total = 3) {
  const flags = Array.isArray(earned) ? earned : Array.from({ length: total }, (_, i) => i < earned);
  const row = el('div', 'stars');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${flags.filter(Boolean).length} of ${flags.length} stars`);
  flags.forEach((on, i) => {
    const s = icon('star', { className: `star${on ? ' is-earned' : ''}` });
    s.style.setProperty('--i', String(i + 3));
    row.append(s);
  });
  return row;
}

/**
 * Document frame: a paper card with print furniture (mono code, index, optional registration marks).
 * Returns the card; append content to `card.body`.
 */
export function documentCard({ code = '', index = '', label = '', title = '', marks = false, className = '', night = false } = {}) {
  const card = el('section', `${night ? 'night' : 'paper'} doc${marks ? ' doc--marks' : ''} ${className}`.trim());
  if (code || index) {
    const head = el('header', 'doc__head');
    head.append(el('span', 'doc__code', code), el('span', 'doc__index', index));
    card.append(head);
  }
  const body = el('div', 'doc__body');
  if (label) body.append(microLabel(label, 'doc__label'));
  if (title) body.append(displayTitle(title, { tag: 'h2', className: 'doc__title' }));
  card.append(body);
  card.body = body;
  return card;
}

/** Definition rows: [{ label, value, tone }] (tone good | warn | bad adds a drawn icon). */
export function specList(lines) {
  const list = el('dl', 'spec');
  const toneIcon = { good: 'check', warn: 'warning', bad: 'blocker' };
  for (const line of lines) {
    const row = el('div', `spec__row spec__row--${line.tone ?? 'neutral'}`);
    const value = el('dd', 'spec__value');
    if (toneIcon[line.tone]) value.append(icon(toneIcon[line.tone], { className: 'spec__icon' }));
    value.append(el('span', '', line.value));
    row.append(el('dt', 'spec__label', line.label), value);
    list.append(row);
  }
  return list;
}
