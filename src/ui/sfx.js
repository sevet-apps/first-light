// UI sound hooks (UI_STYLE section 7). Names: hover | press | confirm | error | open | close.
// Files are registered by the sound pass with registerUiSounds(); until then every call is silent
// (no fetch, no 404, no warning).
const UI_BUS = 'sfx';
const VOLUMES = { hover: 0.35, press: 0.6, confirm: 0.7, error: 0.7, open: 0.5, close: 0.45 };

let audio = null;

export function bindAudio(manager) {
  audio = manager;
}

/** Load a map { name: url } of UI sound files into the audio manager (sound pass). */
export function registerUiSounds(map) {
  audio?.whenUnlocked(() => {
    for (const [name, url] of Object.entries(map)) audio.load(url, `ui.${name}`);
  });
}

export function sfx(name) {
  if (!audio?.unlocked || !audio.buffers.has(`ui.${name}`)) return;
  audio.play(`ui.${name}`, { bus: UI_BUS, volume: VOLUMES[name] ?? 0.5 });
}
