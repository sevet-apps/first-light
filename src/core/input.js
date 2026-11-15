const LOOK_RAD_PER_PX = 0.0022;
const SCROLL_KEYS = ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Keyboard state, mouse look (pointer lock with drag-to-look fallback) and
 *  test helpers. All queries return false/zero while a menu is open. */
export class Input {
  constructor(canvas, { settings, isSuppressed }) {
    this.canvas = canvas;
    this.settings = settings;
    this.isSuppressed = isSuppressed;
    this.lookEnabled = false; // set by the scene manager from scene.look
    this.locked = false;
    this.onLockLost = null; // called when pointer lock is lost (e.g. Esc pressed while locked)

    this.keys = new Set();
    this.edge = new Set();
    this.held = new Map(); // code -> expiry timestamp (ms)
    this.dragging = false;
    this.lookX = 0;
    this.lookY = 0;

    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
    canvas.addEventListener('mousedown', (e) => this.#onMouseDown(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => this.#onMouseMove(e));
    document.addEventListener('pointerlockchange', () => this.#onLockChange());
  }

  isDown(code) {
    if (this.isSuppressed()) return false;
    return this.keys.has(code) || (this.held.get(code) ?? 0) > performance.now();
  }

  /** True only on the frame the key went down. */
  pressed(code) {
    return !this.isSuppressed() && this.edge.has(code);
  }

  /** Simulate a held key for `ms` milliseconds (tests). Resolves when released. */
  hold(code, ms) {
    if (!this.isDown(code)) this.edge.add(code);
    this.held.set(code, performance.now() + ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Accumulated look since last call as {yaw, pitch} radians (settings applied). */
  consumeLook() {
    const k = LOOK_RAD_PER_PX * this.settings.mouseSensitivity;
    const out = this.isSuppressed()
      ? { yaw: 0, pitch: 0 }
      : { yaw: -this.lookX * k, pitch: -this.lookY * k * (this.settings.invertY ? -1 : 1) };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  /** Ask for pointer lock; drag-to-look keeps working if the browser refuses. */
  requestLook() {
    if (!this.lookEnabled || this.locked || !this.canvas.requestPointerLock) return;
    try {
      this.canvas.requestPointerLock()?.catch?.(() => {});
    } catch {
      /* unavailable: drag-to-look fallback */
    }
  }

  releaseLook() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per frame after scenes updated. */
  endFrame() {
    this.edge.clear();
    const now = performance.now();
    for (const [code, until] of this.held) if (until <= now) this.held.delete(code);
  }

  #onKeyDown(e) {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.edge.add(e.code);
    if (e.target === document.body && SCROLL_KEYS.includes(e.code)) e.preventDefault();
  }

  #onMouseDown(e) {
    if (e.button !== 0 || !this.lookEnabled || this.isSuppressed()) return;
    this.dragging = true;
    this.requestLook();
  }

  #onMouseMove(e) {
    if (!this.lookEnabled || !(this.locked || this.dragging)) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  }

  #onLockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.dragging = false;
    if (was && !this.locked) this.onLockLost?.();
  }
}
