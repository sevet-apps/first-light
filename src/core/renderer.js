import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BLOOM_DEFAULTS = { strength: 0.3, radius: 0.5, threshold: 0.9 };
const QUALITY = {
  high: { maxPixelRatio: 2, shadows: true, bloom: true, msaa: 4 },
  low: { maxPixelRatio: 1, shadows: false, bloom: false, msaa: 0 },
};

/** The single shared WebGLRenderer plus the post-processing chain
 *  RenderPass -> UnrealBloomPass -> OutputPass. */
export class Renderer {
  constructor(container, quality) {
    this.container = container;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.info.autoReset = false; // the composer renders several passes per frame; we reset once per frame
    this.canvas = this.gl.domElement;
    container.appendChild(this.canvas);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.gl, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), ...Object.values(BLOOM_DEFAULTS));
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.scene = null;
    this.camera = null;
    this.quality = quality;
    this.onResize = null; // () => void, set by the scene manager
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
  }

  get info() {
    return this.gl.info;
  }

  /** Point the render pipeline at a scene/camera. `bloom` overrides the subtle defaults for this view. */
  setView(scene, camera, { bloom = {} } = {}) {
    this.scene = scene;
    this.camera = camera;
    if (!scene) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.setBloom(bloom);
    this.#fitCamera();
    this.#refreshMaterials();
  }

  /** Bloom parameters; omitted fields fall back to the subtle defaults. */
  setBloom(overrides = {}) {
    Object.assign(this.bloomPass, BLOOM_DEFAULTS, overrides);
  }

  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.high;
    this.quality = name;
    this.gl.shadowMap.enabled = q.shadows;
    this.bloomPass.enabled = q.bloom;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      rt.samples = q.msaa;
      rt.dispose();
    }
    this.resize();
    this.#refreshMaterials();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].maxPixelRatio);
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.#fitCamera();
    this.onResize?.();
  }

  render() {
    if (!this.scene) return;
    this.gl.info.reset();
    this.composer.render();
  }

  #fitCamera() {
    if (this.camera?.isPerspectiveCamera) {
      this.camera.aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
      this.camera.updateProjectionMatrix();
    }
  }

  /** Shadow settings change the shader program, so materials must recompile. */
  #refreshMaterials() {
    this.scene?.traverse((o) => {
      for (const m of [].concat(o.material || [])) m.needsUpdate = true;
    });
  }
}
