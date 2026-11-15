import * as THREE from 'three';
import { disposeObject3D } from '../core/sceneManager.js';
import { createStarfield } from './shared/starfield.js';
import { el, button } from '../core/ui.js';

let root = null;
let stars = null;
let screen = null;
let ctx = null;

function begin() {
  if (ctx.ui.isModalOpen()) return;
  ctx.audio.unlock();
  ctx.scenes.goto('intro');
}

export default {
  id: 'title',

  async enter(c) {
    ctx = c;
    root = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    stars = createStarfield({ count: 2200, size: 1.8 });
    root.add(stars);
    ctx.renderer.setView(root, camera, { bloom: { strength: 0.25 } });

    screen = ctx.ui.screen('screen--interactive');
    screen.style.cursor = 'pointer';
    const settingsBtn = button('Settings', 'secondary', (e) => {
      e.stopPropagation();
      ctx.menus.openSettings();
    });
    settingsBtn.classList.add('btn--small', 'screen__corner');
    screen.append(
      el('h1', 'title-logo', 'First Light'),
      el('p', 'title-tagline', 'Build it. Launch it. Bring home first light.'),
      el('div', 'title-begin', 'Click to begin'),
      settingsBtn,
    );
    screen.addEventListener('click', begin);
  },

  update(dt) {
    stars.rotation.y += dt * 0.012;
    stars.rotation.x += dt * 0.003;
    if (ctx.input.pressed('Enter') || ctx.input.pressed('Space')) begin();
  },

  exit() {
    screen.remove();
    disposeObject3D(root);
    root = stars = screen = ctx = null;
  },
};
