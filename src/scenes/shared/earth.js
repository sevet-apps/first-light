// Placeholder Earth: a procedural land / ocean / cloud texture on a sphere, lit by the scene's sun, plus a thin
// atmosphere rim. The NASA Blue Marble pass (T11) replaces this module's textures.
import * as THREE from 'three';

const TEX_W = 1024;
const TEX_H = 512;

function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Trilinear value noise in [0, 1). */
function noise3(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const fx = x - xi; const fy = y - yi; const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy); const w = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

const fbm = (x, y, z, octaves) => {
  let sum = 0; let amp = 0.5; let f = 1; let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f);
    norm += amp; amp *= 0.5; f *= 2.07;
  }
  return sum / norm;
};

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Equirectangular map: deep and shallow ocean, green and brown land, polar ice, clouds. Seamless (noise on the sphere). */
function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(TEX_W, TEX_H);
  for (let py = 0; py < TEX_H; py++) {
    const lat = Math.PI * (0.5 - (py + 0.5) / TEX_H);
    const cy = Math.sin(lat);
    const ring = Math.cos(lat);
    for (let px = 0; px < TEX_W; px++) {
      const lon = 2 * Math.PI * ((px + 0.5) / TEX_W);
      const x = ring * Math.cos(lon); const z = ring * Math.sin(lon);
      const h = fbm(x * 2.2 + 11, cy * 2.2, z * 2.2, 5);
      let r; let g; let b;
      if (h < 0.52) {
        const depth = clamp01((0.52 - h) / 0.2);
        r = mix(30, 8, depth); g = mix(96, 38, depth); b = mix(150, 96, depth);
      } else {
        const rise = clamp01((h - 0.52) / 0.18);
        const dry = fbm(x * 3.1 - 5, cy * 3.1, z * 3.1 + 9, 3);
        r = mix(mix(58, 168, dry), 128, rise); g = mix(mix(122, 142, dry), 104, rise); b = mix(mix(56, 82, dry), 84, rise);
      }
      const ice = clamp01((Math.abs(cy) - 0.82) / 0.1);
      const cloud = clamp01((fbm(x * 4.5 + 3, cy * 4.5 - 2, z * 4.5, 4) - 0.58) * 3.2) * 0.8;
      const k = Math.max(ice, cloud);
      r = mix(r, 238, k); g = mix(g, 240, k); b = mix(b, 245, k);
      const i = (py * TEX_W + px) * 4;
      image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const RIM_VERTEX = `
  varying vec3 vNormal; varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const RIM_FRAGMENT = `
  uniform vec3 uSun; uniform vec3 uColor;
  varying vec3 vNormal; varying vec3 vWorldNormal;
  void main() {
    float rim = pow(clamp(1.0 + vNormal.z, 0.0, 1.0), 5.0);
    float lit = 0.12 + 0.88 * smoothstep(-0.25, 0.45, dot(normalize(vWorldNormal), uSun));
    gl_FragColor = vec4(uColor * rim * lit * 1.6, rim * lit);
  }`;

/**
 * @param {{ radius: number, segments?: number }} options
 * @returns {{ pivot: THREE.Group, rim: THREE.Mesh, setSun(direction: THREE.Vector3): void }}
 *   pivot: spin it about X to move the ground; rim: add it to the scene (it does not spin) around the same centre.
 */
export function createEarth({ radius, segments = 256 }) {
  const pivot = new THREE.Group();
  pivot.name = 'earth';
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, segments / 2),
    new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.92, metalness: 0 }),
  );
  surface.rotation.set(0, 0.9, Math.PI / 2 - 0.2); // tilts the texture so the ground track crosses mid-latitudes, not the poles
  pivot.add(surface);

  const rimMaterial = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uColor: { value: new THREE.Color(0.38, 0.62, 1) } },
    vertexShader: RIM_VERTEX,
    fragmentShader: RIM_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014, 96, 48), rimMaterial);
  rim.name = 'atmosphere';
  return { pivot, rim, setSun: (direction) => rimMaterial.uniforms.uSun.value.copy(direction).normalize() };
}
