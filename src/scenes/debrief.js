// Debrief: the flight explained on a printed document over a dim, slowly turning Earth, with the three ways on.
import * as THREE from 'three';
import { disposeObject3D } from '../core/sceneManager.js';
import { stagger } from '../ui/motion.js';
import { CATEGORIES } from '../data/components.js';
import { presets } from '../data/presets.js';
import { createOrbitSim } from '../sim/orbit.js';
import { policies, runPolicy } from '../sim/policies.js';
import { debrief } from '../ui/panels.js';
import { createEarth } from './shared/earth.js';
import { createStarfield } from './shared/starfield.js';

const EARTH_RADIUS = 900;
const SPIN_RAD_PER_SECOND = 0.012;

let session = null;

/** Direct entry (?scene=debrief): the current build flown by the greedy operator, so there is something to explain. */
function fallbackResult(state) {
  if (!CATEGORIES.every((c) => state.assembly[c])) state.assembly = { ...presets.balanced };
  return runPolicy(createOrbitSim(state.assembly, state.mission), policies.greedy).result();
}

export default {
  id: 'debrief',

  /** params.result: the analyzeMission() result of the flight (default: state.lastResult). */
  async enter(ctx, params = {}) {
    const { state } = ctx;
    const result = params.result ?? state.lastResult ?? fallbackResult(state);
    state.lastResult = result;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010207);
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
    sun.position.set(-500, 260, 300);
    scene.add(sun, new THREE.HemisphereLight(0x3c5a8c, 0x05080e, 0.35));
    const stars = createStarfield({ seed: 21, radius: 3000 });
    stars.material.depthTest = false;
    stars.renderOrder = -10;
    const earth = createEarth({ radius: EARTH_RADIUS });
    earth.pivot.rotation.z = THREE.MathUtils.degToRad(-23);
    const centre = new THREE.Vector3(260, -EARTH_RADIUS * 0.82, -1250);
    earth.pivot.position.copy(centre);
    earth.rim.position.copy(centre);
    earth.setSun(sun.position);
    scene.add(stars, earth.pivot, earth.rim);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 6000);
    ctx.renderer.setView(scene, camera, { bloom: { strength: 0.25 } });

    const screen = ctx.ui.screen('screen--debrief', true);
    const card = debrief(result, {
      build: { assembly: state.assembly, mission: state.mission },
      onRedesign: () => ctx.scenes.goto('hangar', { redesign: true }),
      onFlyAgain: () => ctx.scenes.goto('launch', { assembly: state.assembly }),
      onMenu: () => ctx.scenes.goto('title'),
    });
    stagger(card.body);
    screen.append(card);
    session = { scene, screen, earth, stars };
  },

  update(dt) {
    const { earth, stars } = session;
    earth.pivot.rotateY(dt * SPIN_RAD_PER_SECOND);
    stars.rotation.y += dt * 0.004;
  },

  exit() {
    session.screen.remove();
    disposeObject3D(session.scene);
    session = null;
  },
};
