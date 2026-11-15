import * as THREE from 'three';
import { createPlaceholderScene } from './shared/placeholder.js';
import { createStarfield } from './shared/starfield.js';

export default createPlaceholderScene({
  id: 'orbit',
  title: 'Orbit operations',
  blurb: 'Placeholder: mode control, orbit simulation and telemetry arrive in a later ticket.',
  actions: [{ label: 'Continue to debrief', kind: 'primary', to: 'debrief' }],
  pausable: true,
  build(root, camera) {
    root.add(createStarfield());
    root.add(new THREE.AmbientLight(0x223048, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 3.5);
    sun.position.set(40, 10, 30);
    root.add(sun);

    const earth = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 48), new THREE.MeshStandardMaterial({ color: 0x2c6fb5, roughness: 0.9 }));
    earth.position.set(0, -46, -10);
    const satellite = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.35 }));
    root.add(earth, satellite);
    camera.position.set(0, 1.5, 7);

    return (dt, t) => {
      satellite.rotation.y = t * 0.3;
      earth.rotation.y += dt * 0.02;
    };
  },
});
