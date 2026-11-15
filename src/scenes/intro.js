import * as THREE from 'three';
import { el, displayTitle, keyCap } from '../core/ui.js';
import { stagger } from '../ui/motion.js';

const DURATION_S = 3;
const SKIP_KEYS = ['Space', 'Escape', 'Enter'];

let screen = null;
let ctx = null;
let startedAt = null;
let leaving = false;

function leave() {
  if (leaving) return;
  leaving = true;
  ctx.scenes.goto('hangar');
}

export default {
  id: 'intro',

  async enter(c) {
    ctx = c;
    startedAt = null;
    leaving = false;
    ctx.renderer.setView(new THREE.Scene(), new THREE.PerspectiveCamera());

    screen = ctx.ui.screen('on-dark', true);
    screen.style.cursor = 'pointer';
    const centre = el('div', 'intro__centre');
    centre.append(displayTitle('Intro Film', { tag: 'h2', className: 'intro__title' }), el('p', 'intro__sub', 'Coming in a later ticket'));
    stagger(centre);
    const skip = el('div', 'night hint-chip intro__skip enter');
    skip.append(keyCap('Space', { night: true }), el('span', '', 'or'), keyCap('Esc', { night: true }), el('span', '', 'to skip'));
    screen.append(centre, skip);
    screen.addEventListener('click', leave);
  },

  update(dt, t) {
    startedAt ??= t;
    if (t - startedAt >= DURATION_S || SKIP_KEYS.some((k) => ctx.input.pressed(k))) leave();
  },

  exit() {
    screen.remove();
    screen = ctx = null;
  },
};
