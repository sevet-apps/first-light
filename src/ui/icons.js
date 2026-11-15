// Inline-SVG line icons (24 px grid, 1.75 px stroke, round caps) and the mission-patch emblem.
// Every path carries pathLength="1" so stroke-draw animations (checkmarks) work on any icon.

const PATHS = {
  check: ['M5 12.5l4.6 4.6L19 7.6'],
  warning: ['M12 4.2L2.9 19.8h18.2z', 'M12 10v4.4', 'M12 17.2v.1'],
  blocker: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8.7 8.7l6.6 6.6', 'M15.3 8.7l-6.6 6.6'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5.4', 'M12 7.6v.1'],
  battery: ['M5.5 7h11a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 3 14.5v-5A2.5 2.5 0 0 1 5.5 7z', 'M21.2 10.4v3.2', 'M7 10.4v3.2', 'M10.6 10.4v3.2'],
  memory: ['M8.5 6h7A2.5 2.5 0 0 1 18 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 15.5v-7A2.5 2.5 0 0 1 8.5 6z', 'M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3'],
  signal: ['M12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z', 'M8.6 8.6a4.8 4.8 0 0 0 0 6.8', 'M15.4 8.6a4.8 4.8 0 0 1 0 6.8', 'M5.7 5.7a8.9 8.9 0 0 0 0 12.6', 'M18.3 5.7a8.9 8.9 0 0 1 0 12.6'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5'],
  camera: ['M4 9a2 2 0 0 1 2-2h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M12 9.6a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z'],
  satellite: ['M9.6 8.6h4.8a1.1 1.1 0 0 1 1.1 1.1v4.6a1.1 1.1 0 0 1-1.1 1.1H9.6a1.1 1.1 0 0 1-1.1-1.1V9.7a1.1 1.1 0 0 1 1.1-1.1z', 'M2.6 9.6h4.2v4.8H2.6z', 'M17.2 9.6h4.2v4.8h-4.2z', 'M6.8 12h1.7M15.5 12h1.7', 'M12 8.6V5.4M10.4 5.4h3.2'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'],
  rocket: ['M12 2.6c3 2.4 4.6 5.8 4.6 9.3V16H7.4v-4.1c0-3.5 1.6-6.9 4.6-9.3z', 'M12 8.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z', 'M7.4 12.6L4.6 15.4v3.2l2.8-1.4', 'M16.6 12.6l2.8 2.8v3.2l-2.8-1.4', 'M10.2 19.2L12 22l1.8-2.8'],
  arrow: ['M4.5 12h15', 'M13.5 6l6 6-6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  volume: ['M4 9.6h3.4L12 5.6v12.8l-4.6-4H4z', 'M15.6 9.2a4.1 4.1 0 0 1 0 5.6', 'M18.4 6.6a7.9 7.9 0 0 1 0 10.8'],
  play: ['M8 5.6v12.8l10.6-6.4z'],
  pause: ['M8.5 5.6v12.8', 'M15.5 5.6v12.8'],
  skip: ['M5.4 6.2L14 12l-8.6 5.8z', 'M18.4 5.8v12.4'],
  moon: ['M19.6 14.4A8 8 0 1 1 9.6 4.4a6.4 6.4 0 0 0 10 10z'],
  star: ['M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.9 1.1-6L3.4 9.7l6-.8z'],
};

const NS = 'http://www.w3.org/2000/svg';

/** An icon as an SVG element. `draw` adds the stroke-draw entrance (checkmarks). */
export function icon(name, { size = null, draw = false, className = '' } = {}) {
  const d = PATHS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon--${name}${draw ? ' icon--draw' : ''}${className ? ` ${className}` : ''}`);
  if (size) { svg.style.width = svg.style.height = typeof size === 'number' ? `${size}px` : size; }
  for (const path of d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', path);
    p.setAttribute('pathLength', '1');
    svg.append(p);
  }
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);

/** Circular mission patch: Earth limb under a rising sun, on deep night. */
export function emblem({ size = 112 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'emblem';
  wrap.style.width = wrap.style.height = `${size}px`;
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i * Math.PI) / 8;
    const x1 = 60 + Math.cos(a) * 22, y1 = 76 + Math.sin(a) * 22;
    const x2 = 60 + Math.cos(a) * (i % 2 ? 29 : 33), y2 = 76 + Math.sin(a) * (i % 2 ? 29 : 33);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }).join('');
  wrap.innerHTML = `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs><clipPath id="patch-clip"><circle cx="60" cy="60" r="50"/></clipPath></defs>
  <circle cx="60" cy="60" r="57" fill="#1B1B1B"/>
  <circle cx="60" cy="60" r="53.5" fill="none" stroke="#F1ECE2" stroke-width="1" opacity=".7"/>
  <g clip-path="url(#patch-clip)">
    <rect width="120" height="120" fill="#14171D"/>
    <g fill="#F1ECE2" opacity=".8"><circle cx="24" cy="30" r=".9"/><circle cx="40" cy="20" r=".7"/><circle cx="84" cy="26" r="1"/><circle cx="97" cy="42" r=".7"/><circle cx="70" cy="16" r=".6"/><circle cx="17" cy="52" r=".6"/></g>
    <g stroke="#F1ECE2" stroke-width="1.5" stroke-linecap="round" opacity=".85">${rays}</g>
    <circle cx="60" cy="76" r="17" fill="#D8382C"/>
    <ellipse cx="60" cy="146" rx="88" ry="72" fill="#14171D" stroke="#F1ECE2" stroke-width="2"/>
    <path d="M14 90a88 72 0 0 1 92 0" fill="none" stroke="#2E5AAC" stroke-width="2.4" opacity=".9" transform="translate(0 -3)"/>
  </g>
</svg>`;
  return wrap;
}
