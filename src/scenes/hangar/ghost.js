// Ghost preview: a translucent copy of the carried part at the socket(s) it would occupy, gently pulsing.
// Paper-white when the part fits, signal red when it does not. It is drawn through the satellite (no depth test)
// so a part that goes on the far side, like the battery on the rear face, can still be seen.
import * as THREE from 'three';

const PAPER = new THREE.Color(0xf1ece2);
const SIGNAL = new THREE.Color(0xd8382c);
const PULSE_HZ = 0.55;

export class Ghost {
  /** @param {import('./satellite.js').Satellite} satellite */
  constructor(satellite) {
    this.satellite = satellite;
    this.group = new THREE.Group();
    this.group.name = 'ghost';
    this.group.visible = false;
    satellite.root.add(this.group);
    this.material = new THREE.MeshBasicMaterial({
      color: PAPER, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });
    this.copies = new Map(); // part id -> { nodes: Map(mount node -> clone) }
    this.part = null;
    this.valid = true;
    this.time = 0;
  }

  /** Show `part` at its sockets. */
  show(part, valid) {
    if (this.part !== part) {
      this.#clear();
      this.part = part;
      this.#copyOf(part);
    }
    this.valid = valid;
    this.group.visible = true;
    const busId = part.category === 'bus' ? part.id : this.satellite.busId ?? 'bus_micro';
    const copy = this.copies.get(part.id);
    for (const [name, clone] of copy) clone.visible = false;
    for (const mount of part.mounts) {
      const node = part.installedNode(mount, busId);
      const clone = copy.get(node.name);
      clone.visible = true;
      this.satellite.installedPose(part, mount, busId).applyTo(clone);
    }
    this.material.color.copy(valid ? PAPER : SIGNAL);
  }

  hide() {
    this.group.visible = false;
    this.part = null;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * PULSE_HZ * 2);
    this.material.opacity = (this.valid ? 0.2 : 0.26) + 0.2 * pulse;
  }

  dispose() {
    this.#clear();
    this.group.removeFromParent();
    this.material.dispose();
  }

  #clear() {
    this.group.visible = false;
    this.part = null;
  }

  // One clone per node of the part (shared geometry, ghost material); built once per part.
  #copyOf(part) {
    if (this.copies.has(part.id)) return;
    const clones = new Map();
    for (const node of Object.values(part.root.userData.nodes)) {
      const clone = node.clone(true);
      clone.visible = false;
      clone.traverse((o) => {
        if (!o.isMesh) return;
        o.material = this.material;
        o.castShadow = o.receiveShadow = false;
        o.renderOrder = 20;
      });
      clone.userData.isGhost = true;
      this.group.add(clone);
      clones.set(node.name, clone);
    }
    this.copies.set(part.id, clones);
  }
}
