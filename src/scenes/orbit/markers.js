// Ground markers on the spinning Earth for imaging targets (amber swath + diamond) and ground stations
// (red pin + pulsing ring), shown for the next two windows of each kind, with a name label over each.
import * as THREE from 'three';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { EARTH_RADIUS, crossTrackOf, groundPoint, phaseAt } from './geometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const SHOW_AHEAD_MINUTES = 28; // windows further away than this stay hidden
const SHOWN_PER_KIND = 2;
const LIFT = 1.2; // metres above the sphere, clear of its facets
const SWATH_STEPS = 28;
const SWATH_HALF_WIDTH = 0.0055; // radians of cross-track angle (about 8 m each side)
const TARGET_COLOR = 0xffc15a;
const STATION_COLOR = 0xf2705f;

const basic = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false, ...extra });

/** Flat ribbon along the ground track from phase a0 to a1, centred on cross-track angle `cross`. */
function swathMesh(a0, a1, cross, material) {
  const positions = [];
  const indices = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= SWATH_STEPS; i++) {
    const a = a0 + ((a1 - a0) * i) / SWATH_STEPS;
    for (const side of [-1, 1]) {
      groundPoint(a, cross + side * SWATH_HALF_WIDTH, EARTH_RADIUS + LIFT, p);
      positions.push(p.x, p.y, p.z);
    }
    if (i < SWATH_STEPS) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, material);
}

function pin(color, topGeometry, height) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, height, 6), basic(color, 0.9));
  pole.position.y = height / 2;
  const top = new THREE.Mesh(topGeometry, basic(color));
  top.position.y = height + 2;
  g.add(pole, top);
  return g;
}

function label(window, kind) {
  const node = el('div', 'night world-label');
  node.append(icon(kind === 'target' ? 'camera' : 'signal'), el('span', '', window.name));
  node.hidden = true;
  return node;
}

/**
 * @param {{ geo: object, schedule: object, earthPivot: THREE.Group, labelLayer: HTMLElement }} deps
 */
export function createMarkers({ geo, schedule, earthPivot, labelLayer }) {
  const entries = [];
  const add = (window, kind) => {
    const mid = (window.start + window.end) / 2;
    const cross = crossTrackOf(window);
    const root = new THREE.Group();
    root.visible = false;
    const centre = groundPoint(-phaseAt(geo, mid), cross, EARTH_RADIUS + LIFT);
    const spot = new THREE.Group();
    spot.position.copy(centre);
    spot.quaternion.setFromUnitVectors(UP, centre.clone().normalize());
    let pulse = null;
    if (kind === 'target') {
      root.add(swathMesh(-phaseAt(geo, window.start), -phaseAt(geo, window.end), cross, basic(TARGET_COLOR, 0.42, { side: THREE.DoubleSide })));
      spot.add(pin(TARGET_COLOR, new THREE.OctahedronGeometry(3.4), 26));
    } else {
      spot.add(pin(STATION_COLOR, new THREE.SphereGeometry(2.4, 14, 10), 26));
      pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), basic(STATION_COLOR, 0.6, { side: THREE.DoubleSide }));
      pulse.position.y = 0.2;
      spot.add(pulse);
    }
    root.add(spot);
    earthPivot.add(root);
    const tag = label(window, kind);
    labelLayer.append(tag);
    entries.push({ window, kind, root, spot, pulse, tag, anchor: new THREE.Vector3() });
  };
  schedule.targets.forEach((w) => add(w, 'target'));
  schedule.passes.forEach((w) => add(w, 'pass'));

  const world = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();

  return {
    /** Show the next windows, animate the station pulse and place the name labels. */
    update(minutes, camera, earthCentre, seconds) {
      for (const kind of ['target', 'pass']) {
        let shown = 0;
        for (const e of entries.filter((x) => x.kind === kind)) {
          const upcoming = e.window.end > minutes && e.window.start - minutes < SHOW_AHEAD_MINUTES && shown < SHOWN_PER_KIND;
          e.root.visible = upcoming;
          if (upcoming) shown++;
        }
      }
      center.copy(earthCentre);
      for (const e of entries) {
        e.tag.hidden = !e.root.visible;
        if (!e.root.visible) continue;
        if (e.pulse) {
          const k = (seconds * 0.45) % 1;
          e.pulse.scale.setScalar(6 + k * 46);
          e.pulse.material.opacity = 0.65 * (1 - k);
        }
        e.spot.updateWorldMatrix(true, false);
        world.setFromMatrixPosition(e.spot.matrixWorld);
        normal.copy(world).sub(center).normalize();
        toCamera.copy(camera.position).sub(world);
        world.y += 34; // label floats above the pin
        world.project(camera);
        const visible = normal.dot(toCamera) > 0 && world.z < 1 && Math.abs(world.x) < 1.1 && Math.abs(world.y) < 1.1;
        e.tag.style.visibility = visible ? 'visible' : 'hidden';
        e.tag.style.transform = `translate(-50%, -100%) translate(${((world.x + 1) / 2) * 100}vw, ${((1 - world.y) / 2) * 100}vh)`;
      }
    },
    /** World position of the pin of a schedule window (a station's link end). */
    pinOf(windowId, target = new THREE.Vector3()) {
      const e = entries.find((x) => x.window.id === windowId);
      e.spot.updateWorldMatrix(true, false);
      return target.setFromMatrixPosition(e.spot.matrixWorld);
    },
  };
}
