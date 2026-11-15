// 2D collision for the first-person controller: a circle (the player) against rotated boxes, circles
// and the hall walls. Movement is sub-stepped so nothing tunnels; penetration is resolved by pushing the
// circle out along the surface normal, which makes it slide, and the velocity part going into a surface
// is removed so pressing into a corner settles to a still position instead of jittering.

const SUBSTEP_M = 0.1; // max travel per sub-step (well below the player radius)
const ITERATIONS = 4;
const SLOP = 0.0005; // rest the circle this far off a surface so contact tests stay stable

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Obstacle with `signed(x, z, out)`: distance from a point to its surface (negative inside) and the outward normal in `out`. */
function compile(def) {
  if (def.shape === 'circle') {
    return {
      def,
      signed(x, z, out) {
        const dx = x - def.x;
        const dz = z - def.z;
        const len = Math.hypot(dx, dz);
        out.x = len > 1e-9 ? dx / len : 1;
        out.z = len > 1e-9 ? dz / len : 0;
        return len - def.r;
      },
    };
  }
  const c = Math.cos(rad(def.yawDeg));
  const s = Math.sin(rad(def.yawDeg));
  const hx = def.w / 2;
  const hz = def.d / 2;
  return {
    def,
    c,
    s,
    hx,
    hz,
    signed(x, z, out) {
      const dx = x - def.x;
      const dz = z - def.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const qx = clamp(lx, -hx, hx);
      const qz = clamp(lz, -hz, hz);
      let nx = lx - qx;
      let nz = lz - qz;
      let dist = Math.hypot(nx, nz);
      if (dist > 1e-9) {
        nx /= dist;
        nz /= dist;
      } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) { // inside: leave through the nearest face
        nx = Math.sign(lx) || 1;
        nz = 0;
        dist = -(hx - Math.abs(lx));
      } else {
        nx = 0;
        nz = Math.sign(lz) || 1;
        dist = -(hz - Math.abs(lz));
      }
      out.x = nx * c + nz * s;
      out.z = -nx * s + nz * c;
      return dist;
    },
  };
}

export class Collision {
  /** colliders: layout.COLLIDERS. hall: layout.HALL. radius: player radius in metres. */
  constructor(colliders, hall, radius) {
    this.hall = hall;
    this.radius = radius;
    this.obstacles = colliders.map(compile);
    this.normals = []; // contact normals of the last move()
    this.contactIds = new Set(); // obstacle ids touched in the last move()
    this.tmp = { x: 0, z: 0 };
  }

  /** Smallest distance from (x, z) to any obstacle or wall surface, and which one. */
  clearance(x, z) {
    const h = this.hall;
    let best = { dist: Infinity, id: null };
    const consider = (dist, id) => { if (dist < best.dist) best = { dist, id }; };
    consider(x - h.minX, 'wall_w');
    consider(h.maxX - x, 'wall_e');
    consider(z - h.minZ, 'wall_n');
    consider(h.maxZ - z, 'wall_s');
    for (const o of this.obstacles) consider(o.signed(x, z, this.tmp), o.def.id);
    return best;
  }

  /** Move `pos` ({x, z}) by (dx, dz) with sub-stepping. Fills `normals` / `contactIds`. */
  move(pos, dx, dz) {
    this.normals.length = 0;
    this.contactIds.clear();
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUBSTEP_M));
    for (let i = 0; i < steps; i++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      this.resolve(pos);
    }
  }

  /** Push `pos` out of every obstacle and inside the walls. */
  resolve(pos) {
    const r = this.radius;
    const h = this.hall;
    const n = this.tmp;
    for (let it = 0; it < ITERATIONS; it++) {
      let touched = false;
      for (const o of this.obstacles) {
        const dist = o.signed(pos.x, pos.z, n);
        if (dist >= r) continue;
        const push = r - dist + SLOP;
        pos.x += n.x * push;
        pos.z += n.z * push;
        this.#contact(n.x, n.z, o.def.id);
        touched = true;
      }
      touched = this.#wall(pos, 'x', h.minX + r, 1, 'wall_w') || touched;
      touched = this.#wall(pos, 'x', h.maxX - r, -1, 'wall_e') || touched;
      touched = this.#wall(pos, 'z', h.minZ + r, 1, 'wall_n') || touched;
      touched = this.#wall(pos, 'z', h.maxZ - r, -1, 'wall_s') || touched;
      if (!touched) break;
    }
  }

  /** Remove the part of `vel` ({x, z}) that points into surfaces touched by the last move(). */
  slideVelocity(vel) {
    for (const n of this.normals) {
      const into = vel.x * n.x + vel.z * n.z;
      if (into < 0) {
        vel.x -= into * n.x;
        vel.z -= into * n.z;
      }
    }
  }

  /** Distance along a ray (origin o, unit direction d, 3D) to the nearest occluding obstacle, or Infinity. */
  rayDistance(ox, oy, oz, dx, dy, dz, maxT) {
    let best = Infinity;
    for (const o of this.obstacles) {
      if (o.def.occludes === false) continue;
      const t = o.c === undefined ? this.#rayCircle(o.def, ox, oy, oz, dx, dy, dz) : this.#rayBox(o, ox, oy, oz, dx, dy, dz);
      if (t < best && t <= maxT) best = t;
    }
    return best;
  }

  #wall(pos, axis, limit, side, id) {
    if ((pos[axis] - limit) * side >= 0) return false;
    pos[axis] = limit;
    this.#contact(axis === 'x' ? side : 0, axis === 'z' ? side : 0, id);
    return true;
  }

  #contact(nx, nz, id) {
    this.contactIds.add(id);
    if (!this.normals.some((n) => Math.abs(n.x - nx) + Math.abs(n.z - nz) < 1e-3)) this.normals.push({ x: nx, z: nz });
  }

  // Slab test in the box's local frame; the box spans y 0..h.
  #rayBox(o, ox, oy, oz, dx, dy, dz) {
    const px = ox - o.def.x;
    const pz = oz - o.def.z;
    const lo = [px * o.c - pz * o.s, oy, px * o.s + pz * o.c];
    const ld = [dx * o.c - dz * o.s, dy, dx * o.s + dz * o.c];
    const min = [-o.hx, 0, -o.hz];
    const max = [o.hx, o.def.h, o.hz];
    let t0 = 0;
    let t1 = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(ld[a]) < 1e-9) {
        if (lo[a] < min[a] || lo[a] > max[a]) return Infinity;
        continue;
      }
      let ta = (min[a] - lo[a]) / ld[a];
      let tb = (max[a] - lo[a]) / ld[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }

  #rayCircle(def, ox, oy, oz, dx, dy, dz) {
    const a = dx * dx + dz * dz;
    if (a < 1e-12) return Infinity;
    const px = ox - def.x;
    const pz = oz - def.z;
    const b = px * dx + pz * dz;
    const disc = b * b - a * (px * px + pz * pz - def.r * def.r);
    if (disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0) return Infinity;
    const y = oy + dy * t;
    return y >= 0 && y <= def.h ? t : Infinity;
  }
}
