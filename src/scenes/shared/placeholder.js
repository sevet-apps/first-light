import * as THREE from 'three';
import { disposeObject3D } from '../../core/sceneManager.js';
import { el, button, documentCard } from '../../core/ui.js';
import { stagger } from '../../ui/motion.js';

/**
 * Factory for placeholder scenes: a 3D backdrop plus a titled card with buttons.
 *  build(root, camera) -> optional animate(dt, t); fills the THREE scene.
 *  actions: [{ label, kind, to }] where `to` is a scene id. code/index are the print furniture of the document card.
 */
export function createPlaceholderScene({ id, title, blurb, actions, code = '', index = '', pausable = false, build, bloom }) {
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
      const card = documentCard({ code, index, label: 'Placeholder', title, className: 'placeholder-card' });
      card.body.append(el('p', '', blurb));
      const row = el('div', 'btn-row');
      for (const a of actions) row.append(button(a.label, a.kind, () => ctx.scenes.goto(a.to)));
      card.body.append(row);
      stagger(card.body);
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
