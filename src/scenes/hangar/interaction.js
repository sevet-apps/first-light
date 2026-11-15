import * as THREE from 'three';

const FADE_S = 0.15; // outline fade in / out
const CARD_EXIT_MS = 140;
const PAPER = 0xf1ece2;
const PROXY_PAD = 0.05; // hit boxes are a little larger than the visible object
const CENTRE = new THREE.Vector2(0, 0);

/**
 * Look-and-press interaction. Interactables are registered with a world object; the object's bounds
 * become an invisible hit box (a child of the object, so it follows it). Each frame a ray from the screen
 * centre picks the nearest interactable in reach that is not hidden behind a collider. The focused one gets
 * a soft paper-coloured outline (inverted hull, faded), a night interaction prompt and, when it provides
 * `info`, a card on the right of the screen.
 *
 * register({ object, kind, id, label, verb, onInteract, reach, info?, outlineWidth? })
 *   info: () => HTMLElement, built when the object gains focus.
 */
export class Interaction {
  /** hud: element that hosts the info card. */
  constructor({ camera, ui, collision, hud, key = 'E' }) {
    this.camera = camera;
    this.ui = ui;
    this.collision = collision;
    this.hud = hud;
    this.key = key;
    this.entries = new Map();
    this.proxies = [];
    this.current = null;
    this.card = null;
    this.outlines = new Set();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 0; // grows to the largest registered reach
    this.proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  }

  register(def) {
    const entry = { outlineWidth: 0.012, ...def, distance: Infinity };
    const bounds = localBounds(entry.object);
    const size = bounds.getSize(new THREE.Vector3()).addScalar(PROXY_PAD * 2);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), this.proxyMaterial);
    proxy.position.copy(bounds.getCenter(new THREE.Vector3()));
    proxy.userData = { isProxy: true, entry };
    entry.object.add(proxy);
    entry.proxy = proxy;
    this.entries.set(entry.id, entry);
    this.proxies.push(proxy);
    this.raycaster.far = Math.max(this.raycaster.far, entry.reach);
    return entry;
  }

  /** Nearest focusable entry under the crosshair, or null. */
  pick() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    for (const p of this.proxies) p.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(CENTRE, cam);
    const { origin, direction: d } = this.raycaster.ray;
    for (const hit of this.raycaster.intersectObjects(this.proxies, false)) {
      const entry = hit.object.userData.entry;
      if (hit.distance > entry.reach) continue;
      if (this.collision.rayDistance(origin.x, origin.y, origin.z, d.x, d.y, d.z, hit.distance) < hit.distance - 0.02) continue;
      entry.distance = hit.distance;
      return entry;
    }
    return null;
  }

  focused() {
    return this.current;
  }

  /** Trigger the focused interactable (the E key). Returns whether something was triggered. */
  interact() {
    if (!this.current) return false;
    this.current.onInteract?.(this.current);
    return true;
  }

  /** Re-evaluate focus now (after a teleport or aim change) without advancing the fades. */
  refresh() {
    this.#setFocus(this.pick());
    return this.current;
  }

  update(dt) {
    this.refresh();
    for (const o of this.outlines) {
      o.value = THREE.MathUtils.clamp(o.value + (Math.sign(o.target - o.value) * dt) / FADE_S, 0, 1);
      if (o.target === 0 && o.value === 0) this.#removeOutline(o);
      else o.material.opacity = o.value * 0.95;
    }
  }

  dispose() {
    for (const o of [...this.outlines]) this.#removeOutline(o);
    this.card?.remove();
    this.card = null;
    this.current = null;
    this.ui.hidePrompt();
    for (const p of this.proxies) {
      p.parent?.remove(p);
      p.geometry.dispose();
    }
    this.proxyMaterial.dispose();
    this.proxies.length = 0;
    this.entries.clear();
  }

  #setFocus(entry) {
    if (entry === this.current) return;
    const prev = this.current;
    this.current = entry;
    if (prev) this.#fadeOutline(prev, 0);
    this.#dropCard();
    if (!entry) {
      this.ui.hidePrompt();
      return;
    }
    this.#fadeOutline(entry, 1);
    this.ui.showPrompt(this.key, entry.verb, entry.label);
    if (entry.info) {
      this.card = entry.info();
      this.card.classList.add('enter');
      this.hud.append(this.card);
    }
  }

  #dropCard() {
    const card = this.card;
    this.card = null;
    if (!card) return;
    card.classList.add('is-leaving');
    setTimeout(() => card.remove(), CARD_EXIT_MS);
  }

  #fadeOutline(entry, target) {
    let o = [...this.outlines].find((x) => x.entry === entry);
    if (!o) {
      if (target === 0) return;
      o = this.#buildOutline(entry);
      this.outlines.add(o);
    }
    o.target = target;
  }

  // Inverted hull: every mesh of the object is drawn again, back faces only, scaled about its own bounds
  // centre so the shell sticks out by `outlineWidth` metres on every side.
  #buildOutline(entry) {
    const material = new THREE.MeshBasicMaterial({
      color: PAPER, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    const meshes = [];
    const w = entry.outlineWidth;
    entry.object.traverse((m) => {
      if (!m.isMesh || m.userData.isProxy || m.userData.isOutline) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const box = m.geometry.boundingBox;
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const scale = new THREE.Vector3(...['x', 'y', 'z'].map((a) => 1 + (2 * w) / Math.max(size[a], 0.02)));
      m.updateMatrix();
      const hull = new THREE.Mesh(m.geometry, material);
      hull.userData.isOutline = true;
      hull.matrixAutoUpdate = false;
      hull.matrix
        .copy(m.matrix)
        .multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z))
        .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
      hull.renderOrder = 1;
      meshes.push({ hull, parent: m.parent });
    });
    for (const { hull, parent } of meshes) parent.add(hull);
    return { entry, material, meshes, value: 0, target: 1 };
  }

  #removeOutline(o) {
    for (const { hull, parent } of o.meshes) parent.remove(hull);
    o.material.dispose();
    this.outlines.delete(o);
  }
}

/** Bounds of an object's meshes in the object's own space (so a hit box can ride along as a child). */
function localBounds(object) {
  object.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const box = new THREE.Box3();
  object.traverse((m) => {
    if (!m.isMesh || m.userData.isProxy) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
  });
  return box;
}
