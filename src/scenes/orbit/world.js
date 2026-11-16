// The 3D world of orbit operations: Earth with a sun-lit terminator, stars, the player's satellite with its
// solar wings, ground markers and the mode effects. Placeholder art; the data it needs (phase, sun direction,
// satellite state) comes from geometry.js and the simulation.
import * as THREE from 'three';
import { createEarth } from '../shared/earth.js';
import { buildSatelliteModel } from '../shared/satelliteModel.js';
import { createStarfield } from '../shared/starfield.js';
import { createDownlink, createImagingBeam } from './effects.js';
import { EARTH_RADIUS, crossTrackOf, groundPoint, orbitGeometry, phaseAt, sunDirection } from './geometry.js';
import { createMarkers } from './markers.js';

const SUN_INTENSITY = 2.3;
const EARTHSHINE_INTENSITY = 0.5;
const FILL_SUNLIT = 0.7; // cold light from above and behind; it comes up in eclipse so the satellite stays readable
const FILL_ECLIPSE = 1.0;
const LIGHT_FADE_PER_SECOND = 2.2;
const WING_FOLLOW_PER_SECOND = 2.5;
const CLOCK_FOLLOW_PER_SECOND = 14;
const SUN_DISTANCE = 3500;

const sunSprite = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,252,240,1)');
  g.addColorStop(0.1, 'rgba(255,244,214,0.95)');
  g.addColorStop(0.28, 'rgba(255,214,150,0.28)');
  g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(2.4, 2.3, 2.1), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sprite.scale.setScalar(300);
  sprite.renderOrder = 5;
  return sprite;
};

/**
 * @param {{ assembly: object, mission: object, schedule: object, labelLayer: HTMLElement }} deps
 */
export function createOrbitWorld({ assembly, mission, schedule, labelLayer }) {
  const geo = orbitGeometry(mission);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);

  const sun = new THREE.DirectionalLight(0xfff1dc, SUN_INTENSITY);
  const earthshine = new THREE.HemisphereLight(0x5b7fb8, 0x080c14, EARTHSHINE_INTENSITY);
  const fill = new THREE.DirectionalLight(0x7f9ccc, FILL_SUNLIT);
  fill.position.set(0.3, 0.7, 1);
  scene.add(sun, sun.target, earthshine, fill);

  const stars = createStarfield({ radius: 4200, size: 1.7, count: 2200, seed: 11 });
  stars.material.depthTest = false;
  stars.renderOrder = -10;
  const glare = sunSprite();
  scene.add(stars, glare);

  const earth = createEarth({ radius: EARTH_RADIUS });
  earth.pivot.position.copy(geo.earthCentre);
  earth.rim.position.copy(geo.earthCentre);
  scene.add(earth.pivot, earth.rim);

  const model = buildSatelliteModel(assembly, { deployed: true });
  const rig = new THREE.Group(); // instrument end points at the Earth: flip the model upside down
  rig.rotation.z = Math.PI;
  rig.add(model.root);
  scene.add(rig);

  const markers = createMarkers({ geo, schedule, earthPivot: earth.pivot, labelLayer });
  const beam = createImagingBeam();
  const link = createDownlink();
  scene.add(...beam.objects, ...link.objects);

  const sunDir = new THREE.Vector3();
  const sunLocal = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const inverseRig = new THREE.Quaternion();
  const solarOffset = Math.acos(mission.ops.pointingSolarFraction);
  const view = { minutes: 0, light: 1, wing: 0 };

  return {
    scene,
    geo,
    satellite: model,
    beam,
    link,

    /** Put the world at simulation time `minutes` and in the satellite's current mode. */
    update(state, dt, seconds, camera) {
      const k = (rate) => 1 - Math.exp(-dt * rate);
      view.minutes += (state.t - view.minutes) * k(CLOCK_FOLLOW_PER_SECOND);
      if (Math.abs(state.t - view.minutes) < 1e-4) view.minutes = state.t;
      const minutes = view.minutes;

      earth.pivot.rotation.x = phaseAt(geo, minutes);
      sunDirection(geo, minutes, sunDir);
      sun.position.copy(sunDir).multiplyScalar(500);
      earth.setSun(sunDir);
      view.light += ((state.sunlit ? 1 : 0) - view.light) * k(LIGHT_FADE_PER_SECOND);
      sun.intensity = SUN_INTENSITY * view.light;
      fill.intensity = FILL_SUNLIT + (FILL_ECLIPSE - FILL_SUNLIT) * (1 - view.light);

      stars.position.copy(camera.position);
      glare.position.copy(camera.position).addScaledVector(sunDir, SUN_DISTANCE);

      // Wings: face the Sun in SUN-POINT (and safe mode), tilt away while imaging or downlinking.
      inverseRig.copy(rig.quaternion).invert();
      sunLocal.copy(sunDir).applyQuaternion(inverseRig);
      const pointing = state.mode === 'IMAGE' || state.mode === 'DOWNLINK';
      const wanted = Math.atan2(sunLocal.z, sunLocal.y) + (pointing ? solarOffset : 0);
      let diff = wanted - view.wing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      view.wing += diff * k(WING_FOLLOW_PER_SECOND);
      for (const pivot of model.wings) pivot.rotation.x = view.wing;

      markers.update(minutes, camera, geo.earthCentre, seconds);
      rig.updateMatrixWorld(true);

      if (state.mode === 'IMAGE' && state.currentTarget) {
        model.lens.getWorldPosition(from);
        groundPoint(0, crossTrackOf(state.currentTarget), EARTH_RADIUS + 1.2, to).add(geo.earthCentre);
        beam.show(from, to, geo.earthCentre, seconds);
      } else beam.hide();

      if (state.mode === 'DOWNLINK' && state.currentPass) {
        model.antenna.getWorldPosition(from);
        markers.pinOf(state.currentPass.id, to);
        to.y += 2;
        link.show(from, to, seconds);
      } else link.hide();
    },
  };
}
