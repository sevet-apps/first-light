import * as THREE from 'three';
import { disposeObject3D } from '../../core/sceneManager.js';
import { el, button } from '../../core/ui.js';

/**
 * Factory for placeholder scenes: a 3D backdrop plus a titled card with buttons.
 *  build(root, camera) -> optional animate(dt, t); fills the THREE scene.
 *  actions: [{ label, kind, to }] where `to` is a scene id.
 */
export function createPlaceholderScene({ id, title, blurb, actions, pausable = false, build, bloom }) {
  let root = null;
  let screen = null;
  let animate = null;

  return {
    id,
    pausable,

    async enter(ctx) {
      root = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
      animate = build(root, camera) ?? null;
      ctx.renderer.setView(root, camera, { bloom });

      screen = ctx.ui.screen('screen--bottom');
      const card = el('div', 'panel');
      card.append(el('h2', 'card-title', title), el('p', 'card-text', blurb));
      const row = el('div', 'btn-row');
      for (const a of actions) row.append(button(a.label, a.kind, () => ctx.scenes.goto(a.to)));
      card.append(row);
      screen.append(card);
    },

    update(dt, t) {
      animate?.(dt, t);
    },

    exit() {
      screen?.remove();
      screen = null;
      if (root) disposeObject3D(root);
      root = null;
      animate = null;
    },
  };
}
