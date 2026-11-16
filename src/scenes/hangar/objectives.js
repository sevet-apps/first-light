// The hangar objective tracker. Stages: walk to the console -> assemble the satellite -> run the
// readiness check -> integrate the payload -> begin the countdown. A redesign visit starts at 'redesign'.
import { CATEGORIES, CATEGORY_LABELS } from '../../data/components.js';

const SLOT_TEXT = CATEGORY_LABELS;
const TICK_PAUSE_S = 1.1; // how long a finished step stays visible before the next one replaces it

export class HangarObjectives {
  /** @param {import('../../core/ui.js').UI} ui */
  constructor(ui) {
    this.ui = ui;
    this.stage = 'walk'; // walk | assemble | ready | integrate | launch | redesign
    this.reached = false;
    this.checked = false;
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
    if (this.stage === 'redesign' && !this.#complete) this.stage = 'assemble';
    if (['ready', 'integrate'].includes(this.stage) && !this.#complete) this.#back();
    if (this.stage === 'assemble') this.timer = this.#complete ? TICK_PAUSE_S : 0;
    this.render();
  }

  /** The console was opened with a complete assembly: the readiness check is done. */
  checkDone() {
    if (this.stage === 'walk' && this.reached) this.stage = 'assemble';
    if (this.stage === 'assemble' && this.#complete) this.stage = 'ready';
    if (this.stage !== 'ready' || this.checked) return;
    this.checked = true;
    this.timer = TICK_PAUSE_S;
    this.render();
  }

  /** Jump to a stage without ceremony (scene start, after the cinematic). */
  setStage(stage) {
    this.stage = stage;
    this.reached = this.reached || stage !== 'walk';
    this.checked = stage === 'integrate' || stage === 'launch';
    this.timer = 0;
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
      this.checked = false;
    } else if (this.stage === 'ready' && this.checked) {
      this.stage = 'integrate';
    }
  }

  // A part was taken off after the check: the build is no longer complete.
  #back() {
    this.stage = 'assemble';
    this.checked = false;
  }

  get #complete() {
    return this.reached && CATEGORIES.every((c) => this.installed.has(c));
  }

  render() {
    const ui = this.ui;
    if (this.stage === 'walk') {
      ui.setObjective('First steps', [{ text: 'Walk to the Mission Console', done: this.reached }]);
    } else if (this.stage === 'assemble') {
      ui.setObjective('Assemble LUMEN-1', CATEGORIES.map((c) => ({ text: SLOT_TEXT[c], done: this.installed.has(c) })));
    } else if (this.stage === 'ready') {
      ui.setObjective('LUMEN-1 assembled', [{ text: 'Run the readiness check at the Mission Console', done: this.checked }]);
    } else if (this.stage === 'integrate') {
      ui.setObjective('Cleared for integration', [{ text: 'Integrate the payload at the Mission Console', done: false }]);
    } else if (this.stage === 'launch') {
      ui.setObjective('Payload on the rocket', [{ text: 'Begin the countdown at Launch Control', done: false }]);
    } else {
      ui.setObjective('Second attempt', [{ text: 'Improve LUMEN-1 and integrate it again', done: false }]);
    }
  }

  get state() {
    return { stage: this.stage, reached: this.reached, checked: this.checked, installed: [...this.installed] };
  }
}
