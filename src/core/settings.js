// Persisted user settings. Every storage access is guarded: the game must work
// when localStorage is blocked or throws.
const KEY = 'firstlight.settings';

const defaults = () => ({
  volumes: { master: 0.8, music: 0.7, voice: 1, sfx: 0.9, ambience: 0.8 },
  mouseSensitivity: 1,
  invertY: false,
  cameraBob: true,
  subtitles: true,
  quality: 'high',
});

const clamp = (v, lo, hi, fallback) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

function sanitize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const volumes = raw.volumes && typeof raw.volumes === 'object' ? raw.volumes : {};
  for (const k of Object.keys(base.volumes)) base.volumes[k] = clamp(volumes[k], 0, 1, base.volumes[k]);
  base.mouseSensitivity = clamp(raw.mouseSensitivity, 0.2, 3, base.mouseSensitivity);
  if (typeof raw.invertY === 'boolean') base.invertY = raw.invertY;
  if (typeof raw.cameraBob === 'boolean') base.cameraBob = raw.cameraBob;
  if (typeof raw.subtitles === 'boolean') base.subtitles = raw.subtitles;
  if (raw.quality === 'low' || raw.quality === 'high') base.quality = raw.quality;
  return base;
}

function load() {
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(KEY)));
  } catch {
    return defaults();
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings stay in memory */
  }
}

export const settings = load();

const listeners = new Set();

/** Subscribe to changes; callback receives (path, value). Returns an unsubscribe function. */
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Set a value by path, e.g. setSetting('volumes.music', 0.5) or setSetting('invertY', true). */
export function setSetting(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = settings;
  for (const k of keys) target = target[k];
  if (!(last in target)) throw new Error(`Unknown setting: ${path}`);
  target[last] = value;
  save();
  for (const fn of listeners) fn(path, value);
}
