import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Cached glTF/texture loading. Cached resources are flagged `userData.shared`
 *  so disposeObject3D never frees what other scenes still use. */
export class Assets {
  constructor() {
    this.onProgress = null; // (0..1) => void, set by the scene manager
    this.cache = new Map();
    this.requested = 0;
    this.completed = 0;
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  /** Start a progress batch (called before a scene loads). */
  beginBatch() {
    this.requested = 0;
    this.completed = 0;
  }

  gltf(url) {
    return this.#cached(url, () => this.gltfLoader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (o.geometry) o.geometry.userData.shared = true;
        for (const m of [].concat(o.material || [])) {
          m.userData.shared = true;
          for (const v of Object.values(m)) if (v && v.isTexture) v.userData.shared = true;
        }
      });
      return gltf;
    }));
  }

  texture(url, { srgb = true } = {}) {
    return this.#cached(url, () => this.textureLoader.loadAsync(url).then((tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.userData.shared = true;
      return tex;
    }));
  }

  #cached(url, start) {
    this.requested++;
    let entry = this.cache.get(url);
    if (!entry) {
      entry = start();
      this.cache.set(url, entry);
      entry.catch(() => this.cache.delete(url));
    }
    return entry.finally(() => {
      this.completed++;
      this.onProgress?.(this.completed / this.requested);
    });
  }
}
