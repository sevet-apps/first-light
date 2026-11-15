import { createPlaceholderScene } from './shared/placeholder.js';
import { createStarfield } from './shared/starfield.js';

export default createPlaceholderScene({
  id: 'debrief',
  title: 'Mission debrief',
  blurb: 'Placeholder: results, stars and the reasons behind them arrive in a later ticket.',
  actions: [
    { label: 'Redesign', kind: 'primary', to: 'hangar' },
    { label: 'Main menu', kind: 'secondary', to: 'title' },
  ],
  build(root, camera) {
    const stars = createStarfield({ seed: 21 });
    root.add(stars);
    camera.position.set(0, 0, 0);
    return (dt) => { stars.rotation.y += dt * 0.01; };
  },
});
