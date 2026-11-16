// The player's finished satellite as one object: the same placeholder part meshes and the same bus sockets
// the hangar uses, assembled in a single call (orbit scene, debrief).
import * as THREE from 'three';
import { CATEGORIES, getPart } from '../../data/components.js';
import { layout } from '../hangar/layout.js';
import { buildDeployedWing, buildParts } from './placeholderParts.js';
import { Part, Satellite } from './satellite.js';
import { createSatelliteMaterials } from './satelliteMaterials.js';

const WING_SOCKETS = [['solar_px', 1], ['solar_nx', -1]];

/**
 * Build a complete satellite from an assembly (slot -> part id).
 * Model space: origin = bottom centre of the bus, +Y up through the instrument, +Z front (antenna side), wings along +-X.
 * @param {object} assembly bus, instrument, solar, battery, antenna
 * @param {{ deployed?: boolean }} options deployed: unfold the solar wings (otherwise they stay stowed against the bus)
 * @returns {{ root: THREE.Group, wings: THREE.Group[], lens: THREE.Object3D, antenna: THREE.Object3D }}
 *   wings: one pivot per deployed wing (rotate about X to track the Sun); lens / antenna: anchors for beams and links.
 */
export function buildSatelliteModel(assembly, { deployed = true } = {}) {
  const ids = CATEGORIES.map((c) => assembly[c]);
  if (ids.some((id) => !getPart(id))) throw new Error('buildSatelliteModel needs a complete assembly');

  const mat = createSatelliteMaterials();
  const parts = new Map([...buildParts(layout, mat, ids)].map(([id, root]) => [id, new Part(getPart(id), root)]));
  const root = new THREE.Group();
  root.name = 'satellite-model';
  const satellite = new Satellite(root, [0, 0, 0], parts);
  for (const id of ids) satellite.attach(parts.get(id)); // bus first: CATEGORIES is ordered

  const wings = [];
  const solar = parts.get(assembly.solar);
  for (const [socket, side] of WING_SOCKETS) {
    const wing = deployed ? buildDeployedWing(mat, solar.id) : null;
    if (!wing) continue;
    const pivot = new THREE.Group();
    pivot.name = `wing_${socket}`;
    pivot.position.setFromMatrixPosition(satellite.socketMatrix(socket));
    pivot.rotation.y = side > 0 ? 0 : Math.PI;
    pivot.add(wing);
    root.add(pivot);
    wings.push(pivot);
  }
  if (wings.length) for (const mount of solar.mounts) mount.node.visible = false;

  const antennaPart = parts.get(assembly.antenna);
  const signal = new THREE.Object3D();
  const node = antennaPart.root.userData.nodes.main;
  node.updateWorldMatrix(true,false);
  signal.position.copy(root.worldToLocal(node.localToWorld(new THREE.Vector3(0,layout.PART_SIZES[antennaPart.id][1],0))));
  root.add(signal);
  return { root, wings, lens: anchorAtTop(root, parts.get(assembly.instrument)), antenna: signal };
}

/** Empty marker at the top centre of a part's bounding box, in model space. */
function anchorAtTop(root, part) {
  const box = new THREE.Box3().setFromObject(part.root);
  const anchor = new THREE.Object3D();
  anchor.position.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  root.add(anchor);
  return anchor;
}
