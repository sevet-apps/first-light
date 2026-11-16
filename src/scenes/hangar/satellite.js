// The satellite on the integration stand, and the poses that connect racks, hands and sockets.
// A Part wraps one catalog part's root Group; its mounts say which child nodes go to which named bus socket
// (data/sockets.js). The Satellite owns a root at SOCKET_bus and answers "where does this node sit when installed".
import * as THREE from 'three';
import { MOUNTS } from '../../data/sockets.js';

const DEG = Math.PI / 180;

/** Position / rotation / scale triple that can be interpolated and written to an Object3D. */
export class Pose {
  constructor(position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1)) {
    this.position = position;
    this.quaternion = quaternion;
    this.scale = scale;
  }

  static fromMatrix(matrix) {
    const pose = new Pose();
    matrix.decompose(pose.position, pose.quaternion, pose.scale);
    return pose;
  }

  static fromObject(object) {
    return new Pose(object.position.clone(), object.quaternion.clone(), object.scale.clone());
  }

  clone() {
    return new Pose(this.position.clone(), this.quaternion.clone(), this.scale.clone());
  }

  copy(other) {
    this.position.copy(other.position);
    this.quaternion.copy(other.quaternion);
    this.scale.copy(other.scale);
    return this;
  }

  toMatrix(target = new THREE.Matrix4()) {
    return target.compose(this.position, this.quaternion, this.scale);
  }

  /** this = a blended towards b by t (t = 0 -> a). */
  blend(a, b, t) {
    this.position.lerpVectors(a.position, b.position, t);
    this.quaternion.slerpQuaternions(a.quaternion, b.quaternion, t);
    this.scale.lerpVectors(a.scale, b.scale, t);
    return this;
  }

  applyTo(object) {
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
    object.scale.copy(this.scale);
  }
}

/** Matrix from a data transform { position, rotation (deg), scale }. */
export function matrixFromData({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map((a) => a * DEG)));
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale));
}

/** Bounds of a node's visible meshes in the node's own space. */
function nodeBounds(node) {
  node.updateWorldMatrix(true, true);
  const inv = node.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  node.traverse((m) => {
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
  });
  return box;
}

/** One catalog part as a physical object. state: 'rack' | 'carried' | 'installed' | 'moving'. */
export class Part {
  constructor(def, root) {
    this.def = def;
    this.id = def.id;
    this.category = def.category;
    this.root = root;
    this.state = 'rack';
    this.rackPose = Pose.fromObject(root);
    this.mounts = MOUNTS[def.id].map((m) => {
      const node = root.userData.nodes[m.node];
      const variants = m.variants
        ? Object.fromEntries(Object.entries(m.variants).map(([bus, name]) => [bus, root.userData.nodes[name]]))
        : null;
      return {
        socket: m.socket,
        bolts: m.bolts !== false,
        node,
        variants,
        offset: matrixFromData(m.offset),
        rackPose: Pose.fromObject(node), // the node's pose inside the root while on the rack and in the hands
        footprint: nodeBounds(node).getSize(new THREE.Vector3()),
      };
    });
    this.bounds = new THREE.Box3(); // rack form, in root space
    for (const m of this.mounts) this.bounds.union(nodeBounds(m.node).applyMatrix4(m.node.matrix));
  }

  /** The node that is visible when this mount is installed on `busId` (a fitted variant, or the node itself). */
  installedNode(mount, busId) {
    return mount.variants?.[busId] ?? mount.node;
  }

  /** Rack and hands show the rack-form nodes; installed shows the nodes fitted to the bus. */
  showForm(form, busId = null) {
    for (const m of this.mounts) {
      if (!m.variants) continue;
      const fitted = form === 'installed' ? m.variants[busId] : null;
      m.node.visible = !fitted;
      for (const n of Object.values(m.variants)) n.visible = n === fitted;
    }
  }
}

/** The satellite on the stand: a root at SOCKET_bus plus the installed parts by category. */
export class Satellite {
  /**
   * @param {THREE.Scene} scene
   * @param {number[]} origin SOCKET_bus in world space
   * @param {Map<string, Part>} parts every part by id (bus roots provide the SOCKET_* empties)
   */
  constructor(scene, origin, parts) {
    this.parts = parts;
    this.root = new THREE.Group();
    this.root.name = 'satellite';
    this.root.position.set(...origin);
    scene.add(this.root);
    this.slots = new Map(); // category -> Part
  }

  get busId() {
    return this.slots.get('bus')?.id ?? null;
  }

  /** Socket frame in satellite space for a bus (default: the installed one, else the smallest bus for previews). */
  socketMatrix(name, busId = this.busId ?? 'bus_micro') {
    if (name === 'bus') return new THREE.Matrix4();
    const bus = this.parts.get(busId);
    const socket = bus.root.userData.nodes.main.getObjectByName(`SOCKET_${name}`);
    if (!socket) throw new Error(`Bus ${busId} has no SOCKET_${name}`);
    socket.updateMatrix();
    return socket.matrix.clone();
  }

  /** Installed pose of a mount's node in satellite space. */
  installedPose(part, mount, busId = this.busId ?? 'bus_micro') {
    const frame = this.socketMatrix(mount.socket, part.category === 'bus' ? part.id : busId);
    return Pose.fromMatrix(frame.multiply(mount.offset));
  }

  /** World matrix of the satellite frame. */
  worldMatrix() {
    this.root.updateWorldMatrix(true, false);
    return this.root.matrixWorld;
  }

  /** Put a part's nodes on their sockets under the satellite root (no animation). */
  attach(part) {
    const busId = part.category === 'bus' ? part.id : this.busId;
    this.root.add(part.root);
    part.root.position.set(0, 0, 0);
    part.root.quaternion.identity();
    part.root.scale.set(1, 1, 1);
    part.showForm('installed', busId);
    for (const m of part.mounts) this.installedPose(part, m, busId).applyTo(part.installedNode(m, busId));
    part.state = 'installed';
    this.slots.set(part.category, part);
  }

  /** Forget a part (its root is re-parented by the caller). */
  release(part) {
    if (this.slots.get(part.category) === part) this.slots.delete(part.category);
  }
}
