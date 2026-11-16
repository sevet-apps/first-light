// A paper document laid over the dimmed, blurred world (the Mission Console, the Launch Control card). Opening it
// frees the mouse; Esc closes it before the pause menu ever sees the key.
import { el } from '../../ui/dom.js';
import { leave } from '../../ui/motion.js';

export class PaperOverlay {
  /** @param {{ ui: import('../../core/ui.js').UI, input: import('../../core/input.js').Input }} deps */
  constructor({ ui, input }) {
    this.ui = ui;
    this.input = input;
    this.backdrop = null;
    this.onClose = null;
    this.onKey = null;
    this.onKeyDown = (e) => this.#key(e);
  }

  get isOpen() {
    return this.backdrop !== null;
  }

  /**
   * Show `card` (a paper document). onKey(event) may return true to claim a key; onClose() runs after the card
   * has been dismissed (not when another document replaces it).
   */
  open(card, { onClose = null, onKey = null } = {}) {
    this.#remove(true);
    this.backdrop = el('div', 'modal-backdrop overlay');
    this.backdrop.append(card);
    this.ui.root.append(this.backdrop);
    this.onClose = onClose;
    this.onKey = onKey;
    this.input.releaseLook();
    window.addEventListener('keydown', this.onKeyDown, true);
    this.ui.sfx('open');
  }

  /** Dismiss the document. relock: ask for the mouse back (needs a user gesture, so not for programmatic closes). */
  close({ relock = true } = {}) {
    if (!this.backdrop) return;
    const done = this.onClose;
    this.#remove(false);
    this.ui.sfx('close');
    if (relock) this.input.requestLook();
    done?.();
  }

  dispose() {
    this.#remove(true);
  }

  #remove(instant) {
    window.removeEventListener('keydown', this.onKeyDown, true);
    const backdrop = this.backdrop;
    this.backdrop = null;
    this.onClose = this.onKey = null;
    if (!backdrop) return;
    if (instant) backdrop.remove();
    else leave(backdrop);
  }

  #key(e) {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.close();
    } else if (!e.repeat && this.onKey?.(e)) {
      e.preventDefault();
    }
  }
}
