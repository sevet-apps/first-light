// Bounded survey footprints and ground-station pins on the spinning Earth.
// (red pin + pulsing ring), shown for the next two windows of each kind, with a name label over each.
import * as THREE from 'three';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { EARTH_RADIUS, crossTrackOf, groundPoint, phaseAt } from './geometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const SHOW_AHEAD_MINUTES = 28; // windows further away than this stay hidden
const SHOWN_PER_KIND = 2;
const LIFT = 6.2; // above the terrain and cloud shell
const TARGET_COLOR = 0x9bc8d2;
const STATION_COLOR = 0xf2705f;

const basic = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false, ...extra });

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
  node.dataset.kind = kind;
  node.append(icon(kind === 'target' ? 'camera' : 'signal'), el('span', '', window.name),
    el('small', 'world-label__action', kind === 'target' ? 'Imaging area · 2' : 'Ground station · 3'));
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
      // A bounded circular survey area replaces the unexplained ribbon around Earth.
      const footprint = new THREE.Mesh(new THREE.RingGeometry(17.5,18.2,64).rotateX(-Math.PI/2),
        basic(TARGET_COLOR,0.62,{side:THREE.DoubleSide,depthWrite:false}));
      footprint.position.y = 0.3;
      spot.add(footprint);
      spot.add(pin(TARGET_COLOR, new THREE.OctahedronGeometry(2.6), 18));
    } else {
      spot.add(pin(STATION_COLOR, new THREE.SphereGeometry(2.1, 14, 10), 18));
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
  const byKind = ['target','pass'].map((kind) => entries.filter((e) => e.kind === kind));
  let nextLabelsAt = 0;

  return {
    /** Show the next windows, animate the station pulse and place the name labels. */
    update(minutes, camera, earthCentre, seconds) {
      for (const group of byKind) {
        let shown = 0;
        for (const e of group) {
          const upcoming = e.window.end > minutes && e.window.start - minutes < SHOW_AHEAD_MINUTES && shown < SHOWN_PER_KIND;
          e.root.visible = upcoming;
          if (upcoming) shown++;
        }
      }
      center.copy(earthCentre);
      const updateLabels = seconds >= nextLabelsAt;
      if (updateLabels) nextLabelsAt = seconds + 1 / 20;
      for (const e of entries) {
        if (e.tag.hidden === e.root.visible) e.tag.hidden = !e.root.visible;
        if (!e.root.visible) continue;
        if (e.pulse) {
          const k = (seconds * 0.45) % 1;
          e.pulse.scale.setScalar(5 + k * 18);
          e.pulse.material.opacity = 0.45 * (1 - k);
        }
        if (!updateLabels) continue;
        const active = minutes >= e.window.start && minutes < e.window.end;
        e.tag.classList.toggle('is-active', active);
        e.spot.updateWorldMatrix(true, false);
        world.setFromMatrixPosition(e.spot.matrixWorld);
        normal.copy(world).sub(center).normalize();
        toCamera.copy(camera.position).sub(world);
        world.addScaledVector(normal, 24);
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
