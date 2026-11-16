// Placeholder launch pad at golden hour: a white rocket, pad and tower, an exhaust flame with smoke, and a sky that
// darkens to black as the rocket climbs. T10 replaces this with the real cinematic of the player's rocket.
import * as THREE from 'three';
import { createStarfield } from '../shared/starfield.js';

const SKY_ZENITH = new THREE.Color(0x1d3d78);
const SKY_HORIZON = new THREE.Color(0xe7a77a);
const SPACE = new THREE.Color(0x020309);
const SMOKE_COUNT = 160;
const SMOKE_LIFE_SECONDS = 8;
const ROCKET = { coreRadius: 1.85, coreHeight: 36, boosterRadius: 0.95, boosterHeight: 22, boosterX: 3.2, baseY: 3 };

const std = (color, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function buildRocket() {
  const g = new THREE.Group();
  const white = std(0xe9ecef, 0.42);
  const dark = std(0x30353c, 0.6, 0.3);
  const add = (geometry, material, y, x = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, 0);
    g.add(m);
  };
  const { coreRadius: cr, coreHeight: ch, boosterRadius: br, boosterHeight: bh, boosterX: bx } = ROCKET;
  add(new THREE.CylinderGeometry(cr, cr, ch, 40), white, ch / 2);
  add(new THREE.CylinderGeometry(cr + 0.02, cr + 0.02, 1.4, 40), dark, ch * 0.62);
  add(new THREE.CylinderGeometry(cr * 0.98, cr, 7, 40), white, ch + 3.5);
  add(new THREE.ConeGeometry(cr * 0.98, 6, 40), white, ch + 10);
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(br, br, bh, 28), white, bh / 2, side * bx);
    add(new THREE.ConeGeometry(br, 3.2, 28), dark, bh + 1.6, side * bx);
  }
  for (const x of [-bx, 0, bx]) add(new THREE.CylinderGeometry(0.5, 0.95, 1.4, 16), dark, -0.5, x);
  return g;
}

function buildTower() {
  const g = new THREE.Group();
  const steel = std(0x4a525e, 0.6, 0.4);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 44, 0.5), steel);
      post.position.set(sx * 2.2, 22, sz * 2.2);
      g.add(post);
    }
  }
  for (let y = 6; y <= 42; y += 6) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.3, 4.9), steel);
    deck.position.y = y;
    g.add(deck);
  }
  return g;
}

/** Sky dome whose horizon and zenith colours the scene fades to black. */
function skyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: SKY_HORIZON.clone() }, uZenith: { value: SKY_ZENITH.clone() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vDir; void main() { gl_FragColor = vec4(mix(uHorizon, uZenith, pow(clamp(vDir.y, 0.0, 1.0), 0.45)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), material);
  dome.renderOrder = -20;
  return dome;
}

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * @param {{ ignitionTime: number }} options liftoff (T0) in seconds since the countdown began
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, update(time: number): void }}
 */
export function createLaunchWorld({ ignitionTime }) {
  const scene = new THREE.Scene();
  scene.background = SPACE.clone();
  scene.fog = new THREE.FogExp2(0xa88a78, 0.0016);
  const sky = skyDome();
  scene.add(sky, new THREE.HemisphereLight(0xc4d4ff, 0x3a2e28, 1.3));
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.8);
  sun.position.set(-60, 24, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1200, 64), std(0x3a3f46, 1));
  ground.rotation.x = -Math.PI / 2;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(16, ROCKET.baseY, 16), std(0x7d848c, 0.9));
  pad.position.y = ROCKET.baseY / 2;
  const tower = buildTower();
  tower.position.set(-9, ROCKET.baseY, 0);
  scene.add(ground, pad, tower);

  const stars = createStarfield({ radius: 900, size: 1.5, seed: 5 });
  stars.material.transparent = true;
  stars.material.opacity = 0;
  stars.material.depthTest = false;
  stars.renderOrder = -10;
  scene.add(stars);

  const rocket = new THREE.Group();
  rocket.position.y = ROCKET.baseY;
  rocket.add(buildRocket());
  scene.add(rocket);

  const flameMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(4, 2.2, 0.7), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const flames = new THREE.Group();
  for (const x of [-ROCKET.boosterX, 0, ROCKET.boosterX]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(x === 0 ? 1.4 : 1, 9, 20, 1, true), flameMaterial);
    flame.position.set(x, -5.2, 0);
    flame.rotation.x = Math.PI;
    flames.add(flame);
  }
  flames.visible = false;
  rocket.add(flames);
  const glow = new THREE.PointLight(0xffa04a, 0, 120, 1.6);
  glow.position.y = -3;
  rocket.add(glow);

  const positions = new Float32Array(SMOKE_COUNT * 3).fill(-1000);
  const ages = new Float32Array(SMOKE_COUNT).fill(1e9);
  const drift = Array.from({ length: SMOKE_COUNT }, () => new THREE.Vector3());
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({
    map: smokeTexture(), color: 0xd8d4cc, size: 16, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
  }));
  smoke.frustumCulled = false;
  scene.add(smoke);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 6000);
  const lookAt = new THREE.Vector3();
  let nextSmoke = 0;
  let lastTime = 0;

  return {
    scene,
    camera,
    /** Pose everything for `time` (seconds since the start of the countdown). */
    update(time) {
      const dt = Math.max(0, time - lastTime);
      lastTime = time;
      const since = time - ignitionTime; // negative before liftoff
      const climb = Math.max(0, since);
      const altitude = 9 * climb ** 2 + 4 * climb ** 3;
      const thrust = THREE.MathUtils.clamp((since + 2) / 2, 0, 1); // engines spool up over the last two seconds
      rocket.position.y = ROCKET.baseY + altitude;
      rocket.position.x = since < 0 ? Math.sin(time * 70) * 0.03 * thrust : 0;
      flames.visible = thrust > 0;
      flames.scale.set(1, 0.4 + thrust * 0.9 + Math.sin(time * 40) * 0.08, 1);
      glow.intensity = thrust * 1800 * (0.9 + Math.sin(time * 33) * 0.1);

      const dark = THREE.MathUtils.smoothstep(climb, 0.4, 3.6);
      sky.material.uniforms.uHorizon.value.copy(SKY_HORIZON).lerp(SPACE, dark);
      sky.material.uniforms.uZenith.value.copy(SKY_ZENITH).lerp(SPACE, dark);
      sky.position.copy(camera.position);
      scene.fog.density = 0.0016 * (1 - dark);
      stars.material.opacity = THREE.MathUtils.smoothstep(dark, 0.45, 1);
      sun.intensity = 2.8 * (1 - 0.7 * dark);

      // Smoke boils out of the pad while the engines burn and stays behind as the rocket leaves.
      if (thrust > 0) {
        nextSmoke += dt * 90 * thrust;
        while (nextSmoke >= 1) {
          nextSmoke -= 1;
          const i = Math.floor(Math.random() * SMOKE_COUNT);
          const a = Math.random() * Math.PI * 2;
          const speed = 4 + Math.random() * 14;
          ages[i] = 0;
          drift[i].set(Math.cos(a) * speed, 1 + Math.random() * 3, Math.sin(a) * speed);
          positions.set([Math.cos(a) * 2, ROCKET.baseY + 1, Math.sin(a) * 2], i * 3);
        }
      }
      for (let i = 0; i < SMOKE_COUNT; i++) {
        if (ages[i] > SMOKE_LIFE_SECONDS) {
          positions[i * 3 + 1] = -1000;
          continue;
        }
        ages[i] += dt;
        drift[i].multiplyScalar(Math.exp(-dt * 0.7));
        positions[i * 3] += drift[i].x * dt;
        positions[i * 3 + 1] += drift[i].y * dt;
        positions[i * 3 + 2] += drift[i].z * dt;
      }
      smokeGeometry.attributes.position.needsUpdate = true;
      smoke.material.opacity = 0.5 * (1 - dark * 0.6);

      const follow = Math.min(altitude, 260);
      camera.position.set(44, 8 + follow * 0.35, 90);
      lookAt.set(0, 24 + follow * 0.95 + (since < 0 ? 0 : 6), 0);
      camera.lookAt(lookAt);
    },
  };
}
