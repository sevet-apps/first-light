/** Create an element: el('div', 'panel', 'text'). */
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A styled button. kind: 'primary' | 'secondary' | 'danger'. */
export function button(label, kind = 'secondary', onClick = null) {
  const b = el('button', `btn btn--${kind}`, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Labelled range slider row. `onInput(value)` fires live. Returns the row element. */
export function sliderRow(label, { min, max, step, value, format = (v) => String(v), onInput }) {
  const row = el('label', 'slider-row');
  const input = el('input', 'slider');
  Object.assign(input, { type: 'range', min, max, step, value });
  const out = el('span', 'slider-row__value', format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  row.append(el('span', 'slider-row__label', label), input, out);
  return row;
}

export function toggleRow(label, value, onChange) {
  const row = el('label', 'toggle-row');
  const wrap = el('span', 'toggle');
  const input = el('input');
  Object.assign(input, { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, el('span'));
  row.append(el('span', 'slider-row__label', label), wrap);
  return row;
}

export function segmentedRow(label, options, value, onChange) {
  const row = el('div', 'toggle-row');
  const group = el('div', 'segmented');
  for (const opt of options) {
    const b = el('button', opt === value ? 'is-active' : '', opt);
    b.type = 'button';
    b.addEventListener('click', () => {
      for (const sibling of group.children) sibling.classList.toggle('is-active', sibling === b);
      onChange(opt);
    });
    group.append(b);
  }
  row.append(el('span', 'slider-row__label', label), group);
  return row;
}

/** Owner of all HUD / overlay DOM: prompt, objective tracker, toasts, modal, fade, loading. */
export class UI {
  constructor(root, loadingEl) {
    this.root = root;
    this.loadingEl = loadingEl;
    this.loadingFill = loadingEl.querySelector('.loading__fill');
    this.modalEl = null;

    this.promptEl = root.appendChild(el('div', 'prompt'));
    this.objectiveEl = root.appendChild(el('div', 'objective'));
    this.toastsEl = root.appendChild(el('div', 'toasts'));
    this.crosshairEl = root.appendChild(el('div', 'crosshair'));
    this.fadeEl = document.body.appendChild(el('div', 'fade'));
    this.promptEl.hidden = this.objectiveEl.hidden = this.crosshairEl.hidden = true;
  }

  /** A full-screen container for a scene's own 2D UI. The scene removes it on exit. */
  screen(className = '', interactive = false) {
    const node = el('div', `screen ${className}${interactive ? ' screen--interactive' : ''}`);
    this.root.append(node);
    return node;
  }

  showPrompt(key, text) {
    this.promptEl.replaceChildren(el('span', 'key', key), el('span', '', text));
    this.promptEl.hidden = false;
  }

  hidePrompt() {
    this.promptEl.hidden = true;
  }

  /** items: [{ text, done }] */
  setObjective(title, items) {
    const list = el('ul');
    for (const item of items) list.append(el('li', item.done ? 'is-done' : '', item.text));
    this.objectiveEl.replaceChildren(el('div', 'objective__title', title), list);
    this.objectiveEl.hidden = false;
  }

  clearObjective() {
    this.objectiveEl.hidden = true;
  }

  showCrosshair(visible) {
    this.crosshairEl.hidden = !visible;
  }

  /** kind: '' | 'warn' | 'error' | 'ok' */
  toast(text, { kind = '', ms = 3000 } = {}) {
    const t = el('div', `toast${kind ? ` toast--${kind}` : ''}`, text);
    this.toastsEl.append(t);
    setTimeout(() => t.classList.add('is-leaving'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  /** Show one modal at a time. actions: [{ label, kind, onClick }]. content: Node. */
  modal({ title, content = null, actions = [], wide = false }) {
    this.closeModal();
    const backdrop = el('div', 'modal-backdrop');
    const panel = el('div', `panel modal${wide ? ' modal--wide' : ''}`);
    panel.append(el('h2', 'modal__title', title));
    if (content) panel.append(content);
    const bar = el('div', 'modal__actions');
    for (const a of actions) bar.append(button(a.label, a.kind, a.onClick));
    panel.append(bar);
    backdrop.append(panel);
    this.root.append(backdrop);
    this.modalEl = backdrop;
    bar.querySelector('button')?.focus();
    return backdrop;
  }

  closeModal() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  isModalOpen() {
    return this.modalEl !== null;
  }

  /** Fade the black layer to opacity `to` (0 or 1) over `seconds`. */
  fade(to, seconds) {
    this.fadeEl.style.transition = `opacity ${seconds}s linear`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 30));
  }

  setLoading(visible) {
    this.loadingEl.classList.toggle('is-visible', visible);
    if (visible) this.setLoadingProgress(0);
  }

  setLoadingProgress(fraction) {
    this.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
  }
}
