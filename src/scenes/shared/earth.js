// Independent terrain, city-light, cloud and atmospheric shells. NASA-derived maps are preloaded.
import * as THREE from 'three';

let maps = null;
export async function prepareEarth({ assets }) {
  const names = ['day', 'night', 'normal', 'specular', 'height', 'clouds'];
  const textures = await Promise.all(names.map((name) => assets.texture(
    `assets/textures/earth/${name}.${name === 'clouds' ? 'png' : 'jpg'}`,
    { srgb: name === 'day' || name === 'night' },
  )));
  maps = Object.fromEntries(names.map((name, i) => {
    textures[i].anisotropy = 8;
    textures[i].wrapS = THREE.RepeatWrapping;
    return [name, textures[i]];
  }));
}

const VERTEX = `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
const ATMOSPHERE = `
  uniform vec3 uSun;
  varying vec3 vNormal; varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(n, eye)), 3.4);
    float day = smoothstep(-0.22, 0.4, dot(n, uSun));
    float sunset = exp(-abs(dot(n, uSun)) * 14.0);
    vec3 color = vec3(0.065,0.29,0.83) + sunset * vec3(0.12,0.035,0.006);
    float alpha = rim * (0.008 + 0.6 * day + 0.1 * sunset);
    gl_FragColor = vec4(color * 1.6, alpha);
  }`;
const CITY_LIGHTS = `
  uniform vec3 uSun; uniform sampler2D uNight;
  varying vec2 vUv; varying vec3 vNormal;
  void main() {
    vec3 lights = texture2D(uNight, vUv).rgb;
    float night = 1.0 - smoothstep(-0.25, 0.12, dot(normalize(vNormal), uSun));
    float strength = max(lights.r, max(lights.g, lights.b));
    gl_FragColor = vec4(lights * vec3(1.25,1.05,0.8), night * smoothstep(0.08,0.55,strength));
  }`;

export function createEarth({ radius, segments = 192 }) {
  if (!maps) throw new Error('Earth textures must be preloaded');
  const pivot = new THREE.Group();
  pivot.name = 'earth';
  const globe = new THREE.Group();
  globe.rotation.set(0, 0.9, Math.PI / 2 - 0.2);
  pivot.add(globe);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2),
    new THREE.MeshPhongMaterial({
      map: maps.day, normalMap: maps.normal, normalScale: new THREE.Vector2(0.65,0.65),
      specularMap: maps.specular, specular: new THREE.Color(0x52677b), shininess: 28,
      displacementMap: maps.height, displacementScale: radius * 0.0008,
    }));
  surface.name = 'earth-terrain';
  globe.add(surface);
  const sun = { value: new THREE.Vector3(0, 1, 0) };
  const lights = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.001, 128,64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: sun, uNight: { value: maps.night } },
      vertexShader: VERTEX, fragmentShader: CITY_LIGHTS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  lights.name = 'earth-city-lights';
  globe.add(lights);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.0035,128,64),
    new THREE.MeshPhongMaterial({ color: 0xf4f8ff, alphaMap: maps.clouds,
      transparent: true, opacity: 0.84, depthWrite: false, shininess: 2,
    }));
  clouds.name = 'earth-cloud-layer';
  globe.add(clouds);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014,96,48),
    new THREE.ShaderMaterial({
      uniforms: { uSun: sun }, vertexShader: VERTEX, fragmentShader: ATMOSPHERE,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  rim.name = 'atmosphere';
  return { pivot, rim, surface, clouds,
    setSun(direction) { sun.value.copy(direction).normalize(); },
    update(dt) { clouds.rotation.y += dt * 0.0007; },
  };
}
