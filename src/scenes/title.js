import * as THREE from 'three';
import { disposeObject3D } from '../core/sceneManager.js';
import { createStarfield } from './shared/starfield.js';
import { el, button, displayTitle, keyCap } from '../core/ui.js';
import { stagger } from '../ui/motion.js';

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

    screen = ctx.ui.screen('title on-dark', true);
    screen.style.cursor = 'pointer';
    const logo = displayTitle('First Light', { tag: 'h1', className: 'title__logo' });
    const actions = el('div', 'title__actions');
    actions.append(
      button('Begin', 'primary', (e) => { e.stopPropagation(); begin(); }, { icon: 'arrow' }),
      button('Settings', 'secondary', (e) => { e.stopPropagation(); ctx.menus.openSettings(); }),
    );
    const stack = el('div', 'title__stack');
    stack.append(
      logo,
      el('div', 'title__rule'),
      el('div', 'title__caption', 'LUMEN-1 · Earth observation mission'),
      el('p', 'title__tagline', 'Build it. Launch it. Bring home first light.'),
      actions,
    );
    const chip = el('span', 'hint-chip');
    chip.append(keyCap('Enter', { night: true }), el('span', '', 'or click anywhere to begin'));
    stack.append(el('div', 'title__hint', ''));
    stack.lastChild.append(chip);
    stagger(stack);
    screen.append(el('div', 'title__limb'), stack);
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
