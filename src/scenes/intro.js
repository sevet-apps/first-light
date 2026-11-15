import * as THREE from 'three';
import { el } from '../core/ui.js';

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

    screen = ctx.ui.screen('screen--interactive');
    screen.style.cursor = 'pointer';
    screen.append(
      el('h2', 'card-title', 'INTRO FILM — coming in T5'),
      el('p', 'hint', 'Click, Space or Esc to skip'),
    );
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
