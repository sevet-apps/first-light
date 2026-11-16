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
    this.lockPending = false;
    this.freeLook = false; // embedded browsers may refuse native pointer lock
    this.onLockError = null;
    this.onLockLost = null; // called when pointer lock is lost (e.g. Esc pressed while locked)
    canvas.tabIndex = 0;
    canvas.dataset.pointerLockSupported = String(typeof canvas.requestPointerLock === 'function');

    this.keys = new Set();
    this.edge = new Set();
    this.held = new Map(); // code -> expiry timestamp (ms)
    this.dragging = false;
    this.lookX = 0;
    this.lookY = 0;

    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.releaseLook(); });
    canvas.addEventListener('mousedown', (e) => this.#onMouseDown(e));
    canvas.addEventListener('click', () => {
      if (!this.isSuppressed()) this.requestLook();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => this.#onMouseMove(e));
    canvas.addEventListener('mouseleave', () => {
      if (!this.freeLook) return;
      this.releaseLook();
      this.onLockLost?.();
    });
    document.addEventListener('pointerlockchange', () => this.#onLockChange());
    document.addEventListener('pointerlockerror', () => {
      if (this.lockPending) this.#lockFailed('NotAllowedError');
    });
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

  /** Native pointer lock when available; click-to-look within the canvas otherwise. */
  requestLook() {
    if (!this.lookEnabled || this.locked || this.freeLook || this.lockPending) return;
    this.canvas.focus({ preventScroll: true });
    if (!this.canvas.requestPointerLock) {
      this.#lockFailed('NotSupportedError');
      return;
    }
    this.lockPending = true;
    this.canvas.dataset.pointerLock = 'pending';
    try {
      this.canvas.requestPointerLock()?.catch?.((error) => {
        if (this.lockPending) this.#lockFailed(error.name);
      });
    } catch (error) {
      this.#lockFailed(error.name);
    }
  }

  #lockFailed(reason) {
    this.lockPending = false;
    this.canvas.dataset.pointerLockError = reason;
    if (!this.lookEnabled || this.isSuppressed()) return;
    this.freeLook = true;
    this.canvas.style.cursor = 'none';
    this.canvas.dataset.pointerLock = 'fallback';
    this.onLockError?.(reason);
  }

  releaseLook() {
    this.freeLook = false;
    this.dragging = false;
    this.lookX = this.lookY = 0;
    this.canvas.style.cursor = '';
    this.canvas.dataset.pointerLock = 'unlocked';
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
    if ((e.target === document.body || e.target === this.canvas) && SCROLL_KEYS.includes(e.code)) e.preventDefault();
  }

  #onMouseDown(e) {
    if (e.button !== 0 || !this.lookEnabled || this.isSuppressed()) return;
    this.dragging = true;
  }

  #onMouseMove(e) {
    if (!this.lookEnabled || this.isSuppressed() || !(this.locked || this.freeLook || this.dragging)) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  }

  #onLockChange() {
    const was = this.locked;
    this.lockPending = false;
    this.locked = document.pointerLockElement === this.canvas;
    this.canvas.dataset.pointerLock = this.locked ? 'locked' : 'unlocked';
    if (this.locked) {
      this.freeLook = false;
      this.dragging = false;
      this.canvas.style.cursor = '';
      if (!this.lookEnabled || this.isSuppressed()) this.releaseLook();
    }
    if (was && !this.locked) this.onLockLost?.();
  }
}
