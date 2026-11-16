import * as THREE from 'three';

const FADE_OUT_S = 0.35;
const FADE_IN_S = 0.5;
const MIN_LOADING_MS = 450; // keep the loading overlay up long enough to read as a transition

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Free the GPU resources of everything under `root` that the scene created.
 *  Objects flagged `userData.shared` (asset cache) are left alone. */
export function disposeObject3D(root) {
  const disposeMaterial = (material) => {
    if (material.userData.shared) return;
    for (const value of Object.values(material)) {
      if (value?.isTexture && !value.userData.shared) value.dispose();
    }
    material.dispose();
  };
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach(disposeMaterial);
    if (o.isLight) {
      o.shadow?.dispose();
      o.dispose?.();
    }
  });
  if (root.background?.isTexture && !root.background.userData.shared) root.background.dispose();
  if (root.environment?.isTexture && !root.environment.userData.shared) root.environment.dispose();
  root.clear();
}

/** Scene contract: { id, look?, pausable?, async enter(ctx, params), update(dt, t), exit(), onResize?() }.
 *  `look` enables mouse look, `pausable` lets Esc open the pause menu. */
export class SceneManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.scenes = new Map();
    this.current = null;
    this.ready = false; // false while a transition is in progress
    this.busy = false;
    this.onBeforeChange = null;
    ctx.renderer.onResize = () => this.current?.onResize?.();
  }

  register(scene) {
    this.scenes.set(scene.id, scene);
  }

  /** Fade out, load, enter the scene, fade in. Ignored while a transition is running. */
  async goto(id, params = {}) {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`Unknown scene: ${id}`);
    if (this.busy) return false;
    const { ui, input, assets, renderer } = this.ctx;
    this.busy = true;
    this.ready = false;
    this.onBeforeChange?.();
    input.lookEnabled = false;
    input.releaseLook();
    ui.hidePrompt();
    ui.clearObjective();
    ui.showCrosshair(false);

    if (this.current) await ui.fade(1, FADE_OUT_S);
    ui.setLoading(true);
    assets.beginBatch();
    assets.onProgress = (p) => ui.setLoadingProgress(p * 0.9);
    const started = performance.now();

    if (this.current) {
      this.current.exit();
      renderer.setView(null, null);
      this.current = null;
    }
    try {
      await next.preload?.(this.ctx);
      await next.enter(this.ctx, params);
      await renderer.warmUp();
    } catch (err) {
      console.error(`Scene "${id}" failed to enter`, err);
    }
    ui.setLoadingProgress(1);
    await wait(Math.max(0, MIN_LOADING_MS - (performance.now() - started)));

    this.current = next;
    input.lookEnabled = !!next.look;
    ui.showCrosshair(!!next.look);
    ui.setLoading(false);
    this.ready = true;
    await ui.fade(0, FADE_IN_S);
    this.busy = false;
    return true;
  }

  update(dt, t) {
    if (this.ready) this.current?.update(dt, t);
  }
}
