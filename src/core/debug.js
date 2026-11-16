import { el } from './ui.js';
import { catalog } from '../data/components.js';
import { mission } from '../data/mission.js';
import { presets } from '../data/presets.js';
import { evaluateAssembly } from '../sim/assembly.js';
import { createOrbitSim } from '../sim/orbit.js';
import { policies } from '../sim/policies.js';

/** Installs the `window.__fl` automation API (always) and the stats overlay (only with ?debug=1). */
export function installDebug({ enabled, app }) {
  const { state, settings, scenes, input, audio, renderer, menus } = app;
  window.__fl = {
    state,
    settings,
    input,
    audio,
    renderer,
    menus,
    sim: { evaluateAssembly, createOrbitSim, catalog, mission, presets, policies },
    goto: (id, params) => scenes.goto(id, params),
    get scene() { return scenes.current; },
    get transitioning() { return scenes.busy; },
  };
  if (!enabled) return () => {};

  const overlay = document.body.appendChild(el('div', 'debug-overlay'));
  let frames = 0;
  let last = performance.now();
  let frameMs = 0;
  return (dtMs) => {
    frames++;
    frameMs = frameMs * 0.9 + dtMs * 0.1;
    const now = performance.now();
    if (now - last < 500) return;
    const { render, memory } = renderer.info;
    overlay.textContent = [
      `${Math.round((frames * 1000) / (now - last))} FPS  ${frameMs.toFixed(1)} ms`,
      `calls ${render.calls}  tris ${render.triangles}`,
      `geo ${memory.geometries}  tex ${memory.textures}`,
      `scene ${scenes.current?.id ?? '-'}`,
    ].join('\n');
    frames = 0;
    last = now;
  };
}
