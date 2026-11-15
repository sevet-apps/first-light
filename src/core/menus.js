import { el, sliderRow, toggleRow, segmentedRow, microLabel } from './ui.js';
import { settings, setSetting } from './settings.js';

const percent = (v) => `${Math.round(v * 100)}%`;
const VOLUMES = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['voice', 'Voice'],
  ['sfx', 'Effects'],
  ['ambience', 'Ambience'],
];

/** The settings form: audio, controls and display sections bound to the persisted settings. */
export function settingsForm() {
  const section = (title, rows) => {
    const node = el('div', 'settings__section');
    const head = el('div', 'settings__head');
    head.append(microLabel(title));
    node.append(head, ...rows);
    return node;
  };
  const audio = VOLUMES.map(([key, label]) => sliderRow(label, {
    min: 0, max: 1, step: 0.01, value: settings.volumes[key], format: percent,
    onInput: (v) => setSetting(`volumes.${key}`, v),
  }));
  const controls = [
    sliderRow('Mouse sensitivity', {
      min: 0.2, max: 3, step: 0.05, value: settings.mouseSensitivity, format: (v) => `${v.toFixed(2)}x`,
      onInput: (v) => setSetting('mouseSensitivity', v),
    }),
    toggleRow('Invert Y', settings.invertY, (v) => setSetting('invertY', v)),
    toggleRow('Camera bob', settings.cameraBob, (v) => setSetting('cameraBob', v)),
  ];
  const display = [
    toggleRow('Subtitles', settings.subtitles, (v) => setSetting('subtitles', v)),
    segmentedRow('Quality', ['low', 'high'], settings.quality, (v) => setSetting('quality', v)),
  ];
  const form = el('div', 'settings');
  const right = el('div', 'settings__stack');
  right.append(section('Controls', controls), section('Display', display));
  form.append(section('Audio', audio), right);
  return form;
}

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
      title: 'Mission Paused',
      label: 'Flight manual',
      code: 'FL-MENU-01',
      hint: 'Esc',
      actions: [
        { label: 'Resume', kind: 'primary', onClick: () => this.resume() },
        { label: 'Settings', kind: 'secondary', onClick: () => this.openSettings('pause') },
        { label: 'Restart mission', kind: 'secondary', onClick: go(() => { this.state.resetMission(); this.scenes.goto('hangar'); }) },
        { label: 'Main menu', kind: 'ghost', onClick: go(() => this.scenes.goto('title')) },
      ],
    });
  }

  /** `from` is 'pause' when reached from the pause menu, otherwise null (title screen). */
  openSettings(from = null) {
    this.mode = 'settings';
    this.settingsReturn = from;
    this.ui.modal({
      title: 'Flight Settings',
      label: 'Preferences',
      code: 'FL-MENU-02',
      hint: 'Esc',
      wide: true,
      layout: 'row',
      content: settingsForm(),
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
}
