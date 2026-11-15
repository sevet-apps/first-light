import * as THREE from 'three';
import { createPlaceholderScene } from './shared/placeholder.js';

export default createPlaceholderScene({
  id: 'launch',
  title: 'Launch',
  blurb: 'Placeholder: the cinematic ascent of your rocket arrives in a later ticket.',
  actions: [{ label: 'Continue to orbit', kind: 'primary', to: 'orbit' }],
  pausable: true,
  build(root, camera) {
    root.background = new THREE.Color(0x1d2c4a);
    root.add(new THREE.HemisphereLight(0xffc88a, 0x1a2330, 1.2));
    const sun = new THREE.DirectionalLight(0xffb46b, 3);
    sun.position.set(-30, 12, 20);
    root.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    const rocket = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 50, 32), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }));
    rocket.position.y = 25;
    root.add(ground, rocket);
    camera.position.set(0, 3, 45);
    camera.lookAt(0, 22, 0);
  },
});
