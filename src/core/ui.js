import { el } from '../ui/dom.js';
import { icon, emblem } from '../ui/icons.js';
import { button, keyCap, displayTitle, microLabel } from '../ui/components.js';
import { sfx, bindAudio } from '../ui/sfx.js';
import { leave, stagger } from '../ui/motion.js';

// Components are re-exported so scenes keep a single import for UI building blocks.
export { el } from '../ui/dom.js';
export * from '../ui/components.js';

const TOAST_ICONS = { '': 'info', ok: 'check', warn: 'warning', error: 'blocker' };
const MAX_TOASTS = 4;

/** Replay a CSS entrance animation on `node`. */
function replay(node, className = 'enter') {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/**
 * The paper card of a modal (pause menu, settings, confirmations). Also used standalone by the UI kit.
 * actions: [{ label, kind, onClick }]. layout 'stack' = full-width buttons, 'row' = buttons aligned right.
 * hint: key cap shown in the document header.
 */
export function modalCard({ title, label = '', code = '', hint = '', content = null, actions = [], wide = false, layout = 'stack' }) {
  const card = el('section', `paper doc modal${wide ? ' modal--wide' : ''}`);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  const head = el('header', 'doc__head');
  head.append(el('span', 'doc__code', code), hint ? keyCap(hint) : el('span'));
  card.append(head);
  const heading = el('div', 'modal__heading');
  if (label) heading.append(microLabel(label));
  heading.append(displayTitle(title, { tag: 'h2', className: 'modal__title' }));
  card.append(heading);
  if (content) card.append(content);
  const bar = el('div', `modal__actions modal__actions--${layout}`);
  for (const a of actions) bar.append(button(a.label, a.kind, a.onClick));
  card.append(bar);
  return stagger(card);
}

/** Owner of all HUD / overlay DOM: prompt, objective tracker, toasts, subtitles, modal, fade, loading. */
export class UI {
  /** `fade: false` skips the full-screen black layer (the UI kit page embeds the UI in a stage). */
  constructor(root, loadingEl, audio = null, { fade = true } = {}) {
    this.root = root;
    this.loadingEl = loadingEl;
    this.modalEl = null;
    this.objectiveKey = '';
    this.objectiveItems = [];
    if (audio) bindAudio(audio);

    this.#buildLoading();
    this.promptEl = root.appendChild(el('div', 'prompt night'));
    this.objectiveEl = root.appendChild(el('div', 'objective night'));
    this.subtitleEl = root.appendChild(el('div', 'subtitles night'));
    this.toastsEl = root.appendChild(el('div', 'toasts'));
    this.crosshairEl = root.appendChild(el('div', 'crosshair'));
    this.fadeEl = fade ? document.body.appendChild(el('div', 'fade')) : el('div');
    this.promptEl.hidden = this.objectiveEl.hidden = this.subtitleEl.hidden = this.crosshairEl.hidden = true;
  }

  /** Play a UI sound: 'hover' | 'press' | 'confirm' | 'error' | 'open' | 'close'. */
  sfx(name) {
    sfx(name);
  }

  /** A full-screen container for a scene's own 2D UI. The scene removes it on exit. */
  screen(className = '', interactive = false) {
    const node = el('div', `screen ${className}${interactive ? ' screen--interactive' : ''}`);
    this.root.append(node);
    return node;
  }

  /** "[E] Pick up · HRI-5 Imager": key cap, verb and optional object name. */
  showPrompt(key, verb, object = '') {
    const wasHidden = this.promptEl.hidden;
    const parts = [keyCap(key, { night: true }), el('span', 'prompt__verb', verb)];
    if (object) parts.push(el('span', 'prompt__dot', '·'), el('span', 'prompt__object', object));
    this.promptEl.replaceChildren(...parts);
    this.promptEl.hidden = false;
    if (wasHidden) replay(this.promptEl);
  }

  hidePrompt() {
    this.promptEl.hidden = true;
  }

  /** items: [{ text, done }]. Calling again with the same items only updates the checkmarks (animated). */
  setObjective(title, items) {
    const key = `${title}\n${items.map((i) => i.text).join('\n')}`;
    if (key === this.objectiveKey && !this.objectiveEl.hidden) {
      items.forEach((item, i) => this.objectiveItems[i].classList.toggle('is-done', !!item.done));
      return;
    }
    this.objectiveKey = key;
    const list = el('ul', 'objective__list');
    this.objectiveItems = items.map((item) => {
      const li = el('li', `objective__item${item.done ? ' is-done' : ''}`);
      const box = el('span', 'objective__box');
      box.append(icon('check', { draw: true }));
      li.append(box, el('span', 'objective__text', item.text));
      list.append(li);
      return li;
    });
    this.objectiveEl.replaceChildren(microLabel('Objectives', 'objective__label'), el('div', 'objective__title', title), list);
    stagger(list);
    this.objectiveEl.hidden = false;
    replay(this.objectiveEl);
  }

  clearObjective() {
    this.objectiveEl.hidden = true;
    this.objectiveKey = '';
  }

  /** Subtitle line (night card, max two lines). Pass '' to hide. */
  setSubtitle(text) {
    const wasHidden = this.subtitleEl.hidden;
    this.subtitleEl.hidden = !text;
    if (!text) return;
    this.subtitleEl.textContent = text;
    if (wasHidden) replay(this.subtitleEl);
  }

  showCrosshair(visible) {
    this.crosshairEl.hidden = !visible;
  }

  /** A paper slip from the top-right. kind: '' | 'warn' | 'error' | 'ok'. */
  toast(text, { kind = '', ms = 3200, detail = '' } = {}) {
    while (this.toastsEl.children.length >= MAX_TOASTS) this.toastsEl.firstChild.remove();
    const slip = el('div', `toast${kind ? ` toast--${kind}` : ''}`);
    const badge = el('span', 'toast__badge');
    badge.append(icon(TOAST_ICONS[kind] ?? 'info', { draw: true }));
    const body = el('div', 'toast__body');
    body.append(el('div', 'toast__text', text));
    if (detail) body.append(el('div', 'toast__detail', detail));
    slip.append(badge, body);
    this.toastsEl.append(slip);
    if (kind === 'error' || kind === 'warn') sfx('error');
    setTimeout(() => leave(slip), ms);
    return slip;
  }

  /**
   * Show one modal paper card at a time. actions: [{ label, kind, onClick }].
   * layout 'stack' = full-width buttons, 'row' = buttons aligned right. hint: key cap shown in the header.
   */
  modal({ title, label = '', code = '', hint = '', content = null, actions = [], wide = false, layout = 'stack' }) {
    this.closeModal(true);
    const backdrop = el('div', 'modal-backdrop');
    const card = modalCard({ title, label, code, hint, content, actions, wide, layout });
    backdrop.append(card);
    this.root.append(backdrop);
    this.modalEl = backdrop;
    sfx('open');
    (card.querySelector('.btn--primary') ?? card.querySelector('.modal__actions button'))?.focus({ preventScroll: true });
    return backdrop;
  }

  /** `instant` skips the exit animation (used when another modal replaces this one). */
  closeModal(instant = false) {
    const old = this.modalEl;
    this.modalEl = null;
    if (!old) return;
    if (instant) { old.remove(); return; }
    sfx('close');
    leave(old);
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
    const pct = Math.round(fraction * 100);
    this.loadingFill.style.transform = `scaleX(${fraction})`;
    this.loadingPct.textContent = `${pct}%`;
  }

  #buildLoading() {
    const card = el('div', 'paper loading__card');
    const body = el('div', 'loading__body');
    const title = displayTitle('Preparing Mission', { tag: 'div', className: 'loading__title' });
    const bar = el('div', 'loading__rule');
    this.loadingFill = bar.appendChild(el('span', 'loading__fill'));
    this.loadingPct = el('span', 'loading__pct', '0%');
    const row = el('div', 'loading__row');
    row.append(microLabel('Loading'), this.loadingPct);
    body.append(el('span', 'loading__code', 'LUMEN-1'), title, bar, row);
    card.append(emblem({ size: 132 }), body);
    this.loadingEl.replaceChildren(card);
  }
}
