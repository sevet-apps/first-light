import { state } from './state.js';
import { presets } from './data/presets.js';
import { settings, onSettingsChange } from './core/settings.js';
import { Renderer } from './core/renderer.js';
import { SceneManager } from './core/sceneManager.js';
import { Input } from './core/input.js';
import { AudioManager } from './core/audio.js';
import { Assets } from './core/assets.js';
import { UI } from './core/ui.js';
import { Menus } from './core/menus.js';
import { installDebug } from './core/debug.js';
import title from './scenes/title.js';
import intro from './scenes/intro.js';
import hangar from './scenes/hangar/index.js';
import launch from './scenes/launch/index.js';
import orbit from './scenes/orbit/index.js';
import debrief from './scenes/debrief.js';

const SCENES = [title, intro, hangar, launch, orbit, debrief];

// URL params: ?scene=<id> &debug=1 &selftest=1|assembly (hangar) &warp=<n> &assembly=<preset> &guide=0 (orbit: skip the first-time card) &integrated=1 (hangar, after integration) &menu=pause|settings (test aid)
const params = new URLSearchParams(location.search);
state.params.debug = params.get('debug') === '1';
state.params.warp = Number(params.get('warp')) || 1;
state.params.assembly = params.get('assembly');
state.params.integrated = params.get('integrated') === '1';
state.params.guide = params.get('guide') !== '0';
state.params.selftest = params.get('selftest') === '1';
state.params.assemblytest = params.get('selftest') === 'assembly';
if (presets[state.params.assembly]) state.assembly = { ...presets[state.params.assembly] };

const audio = new AudioManager(settings, { debug: state.params.debug });
const ui = new UI(document.getElementById('ui'), document.getElementById('loading'), audio);
const renderer = new Renderer(document.getElementById('stage'), settings.quality);
const input = new Input(renderer.canvas, { settings, isSuppressed: () => ui.isModalOpen() });
const assets = new Assets();
const ctx = { renderer, input, audio, assets, ui, settings, state };
const scenes = new SceneManager(ctx);
const menus = new Menus({ ui, input, scenes, state });
ctx.scenes = scenes;
ctx.menus = menus;

for (const scene of SCENES) scenes.register(scene);
onSettingsChange((path, value) => path === 'quality' && renderer.setQuality(value));
const debugTick = installDebug({ enabled: state.params.debug, app: { state, settings, scenes, input, audio, renderer, menus } });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  scenes.update(dt, now / 1000);
  if (scenes.ready) {
    audio.setListener(renderer.camera);
    renderer.render();
  }
  input.endFrame();
  debugTick(dt * 1000);
  requestAnimationFrame(frame);
}

const startId = SCENES.some((s) => s.id === params.get('scene')) ? params.get('scene') : 'title';
scenes.goto(startId).then(() => {
  const menu = params.get('menu');
  if (menu === 'pause') menus.openPause();
  else if (menu === 'settings') menus.openSettings();
});
requestAnimationFrame(frame);
