// Install effects: bolts that spin down (one instanced mesh), spark and dust bursts (two point clouds) and the
// brief glow of a slot. Everything is pooled or short-lived; dispose() frees the GPU objects.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const BOLT = { lift: 0.05, turns: 3, installS: 0.4, removeS: 0.3 };

/** Soft round sprite shared by both particle clouds. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** All bolts of the satellite in one InstancedMesh. Each bolt: world position, axis rotation, animation state. */
class Bolts {
  constructor(scene, capacity = 96) {
    const head = new THREE.CylinderGeometry(0.024, 0.024, 0.017, 6).translate(0, 0.0085, 0);
    this.material = new THREE.MeshStandardMaterial({ color: 0xcfd5dc, metalness: 0.9, roughness: 0.3 });
    this.mesh = new THREE.InstancedMesh(head, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.items = [];
    this.capacity = capacity;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  /** Add the bolts of one owner. points: [{ position, quaternion }]. mode 'in' spins down, 'seated' is final. */
  add(owner, points, mode) {
    for (const pt of points) {
      if (this.items.length >= this.capacity) break;
      this.items.push({ owner, position: pt.position.clone(), quaternion: pt.quaternion.clone(), mode, age: 0 });
    }
    this.#write();
  }

  /** Spin the owner's bolts out and drop them. */
  unfasten(owner) {
    for (const b of this.items) if (b.owner === owner && b.mode !== 'out') { b.mode = 'out'; b.age = 0; }
  }

  count(owner) {
    return this.items.filter((b) => b.owner === owner).length;
  }

  clear(owner) {
    this.items = this.items.filter((b) => b.owner !== owner);
    this.#write();
  }

  update(dt) {
    let dirty = false;
    for (const b of this.items) {
      if (b.mode === 'seated') continue;
      b.age += dt;
      dirty = true;
      if (b.mode === 'in' && b.age >= BOLT.installS) { b.mode = 'seated'; b.age = 0; }
    }
    const before = this.items.length;
    this.items = this.items.filter((b) => !(b.mode === 'out' && b.age >= BOLT.removeS));
    if (dirty || this.items.length !== before) this.#write();
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }

  #write() {
    this.items.forEach((b, i) => {
      let lift = 0;
      let spin = 0;
      let scale = 1;
      if (b.mode === 'in') {
        const k = Math.min(1, b.age / BOLT.installS);
        lift = BOLT.lift * (1 - easeOut(k));
        spin = BOLT.turns * TAU * (1 - easeOut(k));
        scale = Math.min(1, b.age / 0.08);
      } else if (b.mode === 'out') {
        const k = Math.min(1, b.age / BOLT.removeS);
        lift = BOLT.lift * 1.3 * easeIn(k);
        spin = BOLT.turns * TAU * easeIn(k);
        scale = 1 - smooth(0.7, 1, k);
      }
      this.q.copy(b.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
      this.p.copy(b.position).addScaledVector(UP.clone().applyQuaternion(b.quaternion), lift);
      this.s.setScalar(Math.max(scale, 0.0001));
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A pool of point sprites with velocity, gravity and a fade (additive blending, so black = invisible). */
class Burst {
  constructor(scene, { count, size, color, gravity, drag, map }) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.base = new THREE.Color(color);
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.life = new Float32Array(count); // remaining seconds
    this.span = new Float32Array(count);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size, map, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
  }

  /** Emit `n` particles from `origin`, mostly along `normal`, with `spread` randomness. */
  emit(origin, normal, n, { speed, spread, life }) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).multiplyScalar(spread).addScaledVector(normal, 1).normalize();
      const v = speed * (0.4 + Math.random() * 0.6);
      this.positions.set([origin.x, origin.y, origin.z], i * 3);
      this.velocity.set([dir.x * v, dir.y * v, dir.z * v], i * 3);
      this.span[i] = this.life[i] = life * (0.6 + Math.random() * 0.4);
    }
  }

  update(dt) {
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.colors.fill(0, i * 3, i * 3 + 3); continue; }
      alive = true;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.span[i]);
      const damp = Math.exp(-this.drag * dt);
      this.velocity[i * 3] *= damp;
      this.velocity[i * 3 + 1] = this.velocity[i * 3 + 1] * damp - this.gravity * dt;
      this.velocity[i * 3 + 2] *= damp;
      for (let a = 0; a < 3; a++) this.positions[i * 3 + a] += this.velocity[i * 3 + a] * dt;
      const fade = k * k;
      this.colors[i * 3] = this.base.r * fade;
      this.colors[i * 3 + 1] = this.base.g * fade;
      this.colors[i * 3 + 2] = this.base.b * fade;
    }
    if (alive || this.dirty) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
    this.dirty = alive;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class InstallFx {
  constructor(scene) {
    this.scene = scene;
    this.dot = dotTexture();
    this.bolts = new Bolts(scene);
    this.sparks = new Burst(scene, { count: 72, size: 0.05, color: 0xffd9a0, gravity: 5, drag: 2.2, map: this.dot });
    this.dust = new Burst(scene, { count: 36, size: 0.22, color: 0x76838f, gravity: -0.15, drag: 3.2, map: this.dot });
    this.glows = [];
    this.glowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  /** Sparks and dust where a part seats. `normal` points out of the mounting face. */
  seat(position, normal) {
    this.sparks.emit(position, normal, 24, { speed: 2.8, spread: 1.6, life: 0.6 });
    this.dust.emit(position, normal, 8, { speed: 0.6, spread: 1.2, life: 1.0 });
  }

  /** Glow plane on a mount node's contact plane, fading over `seconds`. */
  glow(node, size, seconds = 0.6) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xf1ece2, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(this.glowGeometry, material);
    mesh.position.y = 0.004;
    mesh.scale.set(size.x, 1, size.z);
    mesh.userData.isFx = true;
    node.add(mesh);
    this.glows.push({ mesh, material, base: size.clone(), age: 0, seconds });
  }

  update(dt) {
    this.bolts.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    for (const g of this.glows) {
      g.age += dt;
      const k = Math.min(1, g.age / g.seconds);
      g.material.opacity = 0.6 * (1 - easeOut(k));
      g.mesh.scale.set(g.base.x * (1 + 0.3 * easeOut(k)), 1, g.base.z * (1 + 0.3 * easeOut(k)));
    }
    this.glows = this.glows.filter((g) => {
      if (g.age < g.seconds) return true;
      g.mesh.parent?.remove(g.mesh);
      g.material.dispose();
      return false;
    });
  }

  dispose() {
    for (const g of this.glows) { g.mesh.parent?.remove(g.mesh); g.material.dispose(); }
    this.glows = [];
    this.glowGeometry.dispose();
    this.bolts.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    this.dot.dispose();
  }
}
