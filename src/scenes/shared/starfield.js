import * as THREE from 'three';

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic, subtle star points on a large sphere (no over-bright stars). */
export function createStarfield({ count = 1800, radius = 500, size = 1.6, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.set([radius * r * Math.cos(phi), radius * u, radius * r * Math.sin(phi)], i * 3);
    const brightness = 0.25 + Math.pow(rand(), 3) * 0.75;
    const warm = rand() * 0.25;
    colors.set([brightness * (0.85 + warm), brightness * 0.92, brightness * (1.05 - warm)], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
