// The hangar objective tracker: walk to the console -> assemble the satellite (five slots) -> run the readiness check.
import { CATEGORIES } from '../../data/components.js';

const SLOT_TEXT = { bus: 'Bus', instrument: 'Instrument', solar: 'Solar', battery: 'Battery', antenna: 'Antenna' };
const TICK_PAUSE_S = 1.1; // how long a finished step stays visible before the next one replaces it

export class HangarObjectives {
  /** @param {import('../../core/ui.js').UI} ui */
  constructor(ui) {
    this.ui = ui;
    this.stage = 'walk'; // walk | assemble | ready
    this.reached = false;
    this.installed = new Set();
    this.timer = 0;
    this.render();
  }

  /** The player reached the console (or skipped ahead by picking up a part). */
  walkDone({ immediate = false } = {}) {
    if (this.reached) return;
    this.reached = true;
    if (immediate) this.#advance();
    else this.timer = TICK_PAUSE_S;
    this.render();
  }

  /** Categories that currently hold a part. */
  setInstalled(categories) {
    this.installed = new Set(categories);
    if (this.stage === 'ready' && !this.#complete) this.stage = 'assemble';
    if (this.stage === 'assemble') this.timer = this.#complete ? TICK_PAUSE_S : 0;
    this.render();
  }

  update(dt) {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.#advance();
    this.render();
  }

  #advance() {
    if (this.stage === 'walk') {
      this.stage = 'assemble';
      this.timer = this.#complete ? TICK_PAUSE_S : 0;
    } else if (this.stage === 'assemble' && this.#complete) {
      this.stage = 'ready';
    }
  }

  get #complete() {
    return this.reached && CATEGORIES.every((c) => this.installed.has(c));
  }

  render() {
    if (this.stage === 'walk') {
      this.ui.setObjective('First steps', [{ text: 'Walk to the Mission Console', done: this.reached }]);
    } else if (this.stage === 'assemble') {
      this.ui.setObjective('Assemble LUMEN-1', CATEGORIES.map((c) => ({ text: SLOT_TEXT[c], done: this.installed.has(c) })));
    } else {
      this.ui.setObjective('LUMEN-1 assembled', [{ text: 'Run the readiness check at the Mission Console', done: false }]);
    }
  }

  get state() {
    return { stage: this.stage, reached: this.reached, installed: [...this.installed] };
  }
}
