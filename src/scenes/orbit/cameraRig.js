// Camera around the satellite: a slow cinematic drift, drag to orbit, wheel to zoom.
import * as THREE from 'three';

const DEFAULT_DISTANCE = 10.8;
const DISTANCE_RANGE = [6, 60];
const EARTH_DISTANCE_RANGE = [2400, 6800];
const ELEVATION_RANGE = [-8, 62].map(THREE.MathUtils.degToRad);
const DRAG_RAD_PER_PX = 0.0055;
const ZOOM_PER_WHEEL = 0.0012;
const DRIFT_AZIMUTH = THREE.MathUtils.degToRad(9);
const DRIFT_ELEVATION = THREE.MathUtils.degToRad(2.5);
const LOOK_DROP = 0.2; // the view centre sits this share of the distance below the satellite, so Earth fills the lower frame
const FOV = 46;

export class CameraRig {
  /** @param {HTMLCanvasElement} canvas the element that receives drag and wheel */
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.2, 14000);
    this.camera.layers.enable(1);
    this.view = 'satellite';
    this.azimuth = THREE.MathUtils.degToRad(34); // 0 = behind the satellite, towards +Z
    this.elevation = THREE.MathUtils.degToRad(13);
    this.distance = DEFAULT_DISTANCE;
    this.dragging = false;
    this.time = 0;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.viewTarget = new THREE.Vector3();
    this.initialized = false;
    this.listeners = [
      ['pointerdown', (e) => this.#down(e)],
      ['pointermove', (e) => this.#move(e)],
      ['pointerup', (e) => this.#up(e)],
      ['pointercancel', (e) => this.#up(e)],
      ['wheel', (e) => this.#wheel(e)],
    ];
    for (const [type, fn] of this.listeners) canvas.addEventListener(type, fn, { passive: false });
    canvas.style.cursor = 'grab';
  }

  dispose() {
    for (const [type, fn] of this.listeners) this.canvas.removeEventListener(type, fn);
    this.canvas.style.cursor = '';
  }

  /** Place the camera; `focus` is the satellite position. */
  update(dt, focus, earthCentre = null) {
    this.time += dt;
    const az = this.azimuth + Math.sin(this.time * 0.11) * DRIFT_AZIMUTH;
    const el = this.elevation + Math.sin(this.time * 0.07 + 1.3) * DRIFT_ELEVATION;
    const cosEl = Math.cos(el);
    const earthView = this.view === 'earth' && earthCentre;
    const centre = earthView ? earthCentre : focus;
    this.desired.set(
      centre.x + this.distance * cosEl * Math.sin(az),
      centre.y + this.distance * Math.sin(el),
      centre.z + this.distance * cosEl * Math.cos(az),
    );
    this.viewTarget.set(centre.x, centre.y - (earthView ? 0 : this.distance * LOOK_DROP), centre.z);
    const k = this.initialized ? 1 - Math.exp(-dt * 5) : 1;
    this.camera.position.lerp(this.desired, k);
    this.target.lerp(this.viewTarget, k);
    this.initialized = true;
    this.camera.lookAt(this.target);
  }

  setView(view, sun = null) {
    this.view = view === 'earth' ? 'earth' : 'satellite';
    this.distance = this.view === 'earth' ? 4800 : DEFAULT_DISTANCE;
    this.elevation = THREE.MathUtils.degToRad(this.view === 'earth' ? 24 : 13);
    if (this.view === 'earth' && sun) {
      this.azimuth = Math.atan2(sun.x, sun.z) + 0.65;
      this.elevation = Math.asin(THREE.MathUtils.clamp(sun.y,-1,1));
    } else if (this.view === 'satellite') this.azimuth = THREE.MathUtils.degToRad(34);
    // Each preset has a safe centre; never interpolate through the Earth on the way back.
    this.initialized = false;
  }

  #down(e) {
    if (e.button !== 0) return;
    this.dragging = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  #move(e) {
    if (!this.dragging) return;
    this.azimuth -= e.movementX * DRAG_RAD_PER_PX;
    const range = this.view === 'earth' ? [-Math.PI*0.45,Math.PI*0.45] : ELEVATION_RANGE;
    this.elevation = THREE.MathUtils.clamp(this.elevation + e.movementY * DRAG_RAD_PER_PX, ...range);
  }

  #up(e) {
    this.dragging = false;
    this.canvas.releasePointerCapture?.(e.pointerId);
    this.canvas.style.cursor = 'grab';
  }

  #wheel(e) {
    e.preventDefault();
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(e.deltaY * ZOOM_PER_WHEEL),
      ...(this.view === 'earth' ? EARTH_DISTANCE_RANGE : DISTANCE_RANGE));
  }
}
