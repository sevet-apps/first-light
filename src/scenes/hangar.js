import * as THREE from 'three';
import { disposeObject3D } from '../core/sceneManager.js';
import { el, button, keyCap } from '../core/ui.js';

const ROOM = { w: 60, d: 40, h: 70 };
const EYE_HEIGHT = 1.7;
const MAX_PITCH = THREE.MathUtils.degToRad(85);

let root = null;
let camera = null;
let screen = null;
let ctx = null;
let yaw = 0;
let pitch = 0;

function applyLook() {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function buildRoom(scene) {
  scene.background = new THREE.Color(0x0d131b);
  scene.fog = new THREE.Fog(0x0d131b, 30, 110);
  scene.add(new THREE.HemisphereLight(0x5b6f8a, 0x1a2330, 2.4));

  const key = new THREE.DirectionalLight(0xffb46b, 3.2);
  key.position.set(-18, 60, 10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 120 });
  scene.add(key, key.target);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d),
    new THREE.MeshStandardMaterial({ color: 0x2a3646, roughness: 0.95, side: THREE.BackSide }),
  );
  walls.position.y = ROOM.h / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0x8e99a6, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const pad = new THREE.Mesh(new THREE.RingGeometry(5, 5.4, 64), new THREE.MeshBasicMaterial({ color: 0xffc400, side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(walls, floor, pad);
}

function buildScaleProps(scene) {
  const rocket = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 50, 40), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.45 }));
  rocket.position.y = 25;
  rocket.castShadow = true;
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.24, 6, 12), new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.7 }));
  person.position.set(4.5, 0.9, 4);
  person.castShadow = true;
  scene.add(rocket, person);
}

export default {
  id: 'hangar',
  look: true,
  pausable: true,

  async enter(c) {
    ctx = c;
    root = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    camera.position.set(0, EYE_HEIGHT, 16);
    yaw = 0;
    pitch = THREE.MathUtils.degToRad(12);
    applyLook();
    buildRoom(root);
    buildScaleProps(root);
    ctx.renderer.setView(root, camera);

    screen = ctx.ui.screen('screen--bottom');
    const bar = el('div', 'hud-bottom');
    const hint = el('div', 'night hint-chip enter');
    hint.append(el('span', '', 'Click to look around, or hold the mouse and drag'), keyCap('Esc', { night: true }), el('span', '', 'Menu'));
    bar.append(hint, button('Continue to launch', 'primary', () => ctx.scenes.goto('launch'), { key: 'Enter' }));
    screen.append(bar);
    ctx.ui.setObjective('Hangar placeholder', [
      { text: 'Look around the high bay', done: true },
      { text: 'Build the satellite (later ticket)', done: false },
    ]);
  },

  update() {
    const look = ctx.input.consumeLook();
    yaw += look.yaw;
    pitch = THREE.MathUtils.clamp(pitch + look.pitch, -MAX_PITCH, MAX_PITCH);
    applyLook();
    if (ctx.input.pressed('Enter')) ctx.scenes.goto('launch');
  },

  exit() {
    screen.remove();
    disposeObject3D(root);
    root = camera = screen = ctx = null;
  },
};
