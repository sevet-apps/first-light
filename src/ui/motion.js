// Motion helpers (UI_STYLE section 6). All of them degrade to fades / instant changes under prefers-reduced-motion.

const reduceQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => !!reduceQuery?.matches;

/** Give each child an index so CSS can stagger its entrance (40 ms steps). */
export function stagger(parent, { start = 0 } = {}) {
  parent.classList.add('stagger');
  [...parent.children].forEach((child, i) => child.style.setProperty('--i', String(start + i)));
  return parent;
}

/** Play the exit animation (200 ms fade + 8 px drop), then remove the node. */
export function leave(node) {
  return new Promise((resolve) => {
    if (!node.isConnected) { resolve(); return; }
    node.classList.add('is-leaving');
    const done = () => { node.remove(); resolve(); };
    node.addEventListener('animationend', done, { once: true });
    setTimeout(done, 260);
  });
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const tweens = new WeakMap();

/** Animate a number inside `node` from its current value to `to`. */
export function countTo(node, to, { format = (v) => String(Math.round(v)), duration = 520 } = {}) {
  cancelAnimationFrame(tweens.get(node));
  const from = Number(node.dataset.value ?? to);
  node.dataset.value = String(to);
  if (prefersReducedMotion() || from === to || !node.isConnected) {
    node.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / duration);
    node.textContent = format(from + (to - from) * easeOutCubic(k));
    if (k < 1) tweens.set(node, requestAnimationFrame(tick));
  };
  tweens.set(node, requestAnimationFrame(tick));
}
