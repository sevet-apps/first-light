import { el, sliderRow, toggleRow, segmentedRow } from './ui.js';
import { settings, setSetting } from './settings.js';

const percent = (v) => `${Math.round(v * 100)}%`;
const VOLUMES = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['voice', 'Voice'],
  ['sfx', 'Effects'],
  ['ambience', 'Ambience'],
];

/** Pause menu and settings panel. Esc (or losing pointer lock) opens the pause
 *  menu in scenes flagged `pausable`; the title screen opens Settings directly. */
export class Menus {
  constructor({ ui, input, scenes, state }) {
    this.ui = ui;
    this.input = input;
    this.scenes = scenes;
    this.state = state;
    this.mode = null; // null | 'pause' | 'settings'
    this.settingsReturn = null; // 'pause' when settings were opened from the pause menu

    window.addEventListener('keydown', (e) => this.#onKey(e));
    input.onLockLost = () => {
      if (this.#canPause()) this.openPause();
    };
    scenes.onBeforeChange = () => this.close();
  }

  openPause() {
    if (this.mode === 'pause') return;
    this.mode = 'pause';
    this.input.releaseLook();
    const go = (fn) => () => { this.close(); fn(); };
    this.ui.modal({
      title: 'Paused',
      actions: [
        { label: 'Resume', kind: 'primary', onClick: () => this.resume() },
        { label: 'Settings', kind: 'secondary', onClick: () => this.openSettings('pause') },
        { label: 'Restart mission', kind: 'secondary', onClick: go(() => { this.state.resetMission(); this.scenes.goto('hangar'); }) },
        { label: 'Main menu', kind: 'danger', onClick: go(() => this.scenes.goto('title')) },
      ],
    });
  }

  /** `from` is 'pause' when reached from the pause menu, otherwise null (title screen). */
  openSettings(from = null) {
    this.mode = 'settings';
    this.settingsReturn = from;
    this.ui.modal({
      title: 'Settings',
      wide: true,
      content: this.#settingsForm(),
      actions: [{ label: from ? 'Back' : 'Close', kind: 'primary', onClick: () => this.#closeSettings() }],
    });
  }

  resume() {
    this.close();
    this.input.requestLook(); // the click that resumed is a user gesture
  }

  close() {
    this.mode = null;
    this.ui.closeModal();
  }

  #closeSettings() {
    if (this.settingsReturn === 'pause') {
      this.mode = null;
      this.openPause();
    } else {
      this.close();
    }
  }

  #canPause() {
    return !!this.scenes.current?.pausable && this.scenes.ready && this.mode === null;
  }

  #onKey(e) {
    if (e.code !== 'Escape' || e.repeat) return;
    if (this.mode === 'settings') this.#closeSettings();
    else if (this.mode === 'pause') this.resume();
    else if (this.#canPause()) this.openPause();
  }

  #settingsForm() {
    const form = el('div', 'settings');
    form.append(el('h3', 'settings__group', 'Audio'));
    for (const [key, label] of VOLUMES) {
      form.append(sliderRow(label, {
        min: 0, max: 1, step: 0.01, value: settings.volumes[key], format: percent,
        onInput: (v) => setSetting(`volumes.${key}`, v),
      }));
    }
    form.append(el('h3', 'settings__group', 'Controls'));
    form.append(sliderRow('Mouse sensitivity', {
      min: 0.2, max: 3, step: 0.05, value: settings.mouseSensitivity, format: (v) => `${v.toFixed(2)}x`,
      onInput: (v) => setSetting('mouseSensitivity', v),
    }));
    form.append(toggleRow('Invert Y', settings.invertY, (v) => setSetting('invertY', v)));
    form.append(el('h3', 'settings__group', 'Display'));
    form.append(toggleRow('Subtitles', settings.subtitles, (v) => setSetting('subtitles', v)));
    form.append(segmentedRow('Quality', ['low', 'high'], settings.quality, (v) => setSetting('quality', v)));
    return form;
  }
}
