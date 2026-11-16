// Orbit-operations HUD: the UI kit's telemetry, timeline and mode cards plus the warp control, the world labels
// and the one-time guidance card. All DOM lives in one screen layer that the scene removes on exit.
import { el, button, documentCard, keyCap, segmented, microLabel } from '../../core/ui.js';
import { orbitHud } from '../../ui/panels.js';
import { stagger } from '../../ui/motion.js';
import { WARPS } from './clock.js';
import { hintFor } from './hints.js';

const TOAST_GAP_PX = 12;

let focusExplained = false; // the focus-time toast appears once per session

const MODE_GUIDE = [
  ['1', 'SUN-POINT', 'Panels face the Sun: full charging. Your resting mode, and the way to refill the battery before an eclipse.'],
  ['2', 'IMAGE', 'The instrument records, but only while a target window is open. Panels turn away: about half the power.'],
  ['3', 'DOWNLINK', 'Sends stored data home, but only during a ground-station pass. Panels turn away here too.'],
];

/** Paper card shown once per session: the three modes in three lines. */
function guidanceCard(onBegin) {
  const card = documentCard({ code: 'FL-DOC-004', index: '04 / 05', label: 'Operations briefing', title: 'Three Modes', marks: true, className: 'guide' });
  const list = el('ol', 'guide__modes');
  for (const [key, name, text] of MODE_GUIDE) {
    const li = el('li', 'guide__mode');
    const body = el('div', 'guide__text');
    body.append(el('b', '', name), el('span', '', text));
    li.append(keyCap(key), body);
    list.append(li);
  }
  const tips = el('p', 'guide__tip');
  tips.append('Watch the timeline for what is coming. Time warp ', keyCap('['), ' ', keyCap(']'), ' slows to 1× by itself before each window opens.');
  const actions = el('div', 'btn-row doc__actions');
  actions.append(button('Begin operations', 'primary', onBegin, { icon: 'arrow' }));
  card.body.append(list, el('hr', 'rule rule--hair'), tips, actions);
  stagger(card.body);
  return card;
}

/**
 * @param {object} ctx app context
 * @param {{ mission: object, onMode: (mode: string) => void, onWarp: (warp: number) => void }} options
 */
export function createOrbitHud(ctx, { mission, onMode, onWarp }) {
  const screen = ctx.ui.screen('orbit-layout');
  const kit = orbitHud({ goalMB: mission.goalMB, orbits: mission.orbit.orbits, onMode });
  const warpBar = el('div', 'night warp-bar');
  const warpSelect = segmented(WARPS.map((w) => `${w}×`), '1×', (label) => onWarp(parseInt(label, 10)), { night: true });
  warpBar.append(microLabel('Warp'), keyCap('[', { night: true }), warpSelect, keyCap(']', { night: true }));
  const focusChip = el('div', 'night focus-chip', 'Focus · ½×');
  focusChip.title = 'Time slows while a window is open';
  focusChip.hidden = true;
  const labels = el('div', 'world-labels');
  const left = el('div', 'orbit-left');
  left.append(kit.telemetry, warpBar, focusChip);
  screen.append(labels, left, kit.timeline, kit.modes);

  let guide = null;
  let lastHint = '';

  return {
    labelLayer: labels,
    get guideOpen() { return !!guide; },

    /** Show the guidance card; `onBegin` runs when the player confirms. */
    showGuidance(onBegin) {
      guide = el('div', 'guide-wrap');
      guide.append(guidanceCard(() => { this.closeGuidance(); onBegin(); }));
      screen.append(guide);
    },

    closeGuidance() {
      guide?.remove();
      guide = null;
    },

    update(state, upcoming, warp, { note = null, eclipseEndsIn = null, focus = false } = {}) {
      if (focus && focusChip.hidden && !focusExplained) {
        focusExplained = true;
        ctx.ui.toast('Focus time', { ms: 4200, detail: 'Time slows while a window is open.' });
      }
      focusChip.hidden = !focus;
      kit.update(state, upcoming);
      warpSelect.select(`${warp}×`);
      const hint = guide ? '' : note ?? hintFor(state, upcoming, { eclipseEndsIn });
      if (hint !== lastHint) {
        ctx.ui.setSubtitle(hint);
        lastHint = hint;
      }
      // Toasts sit below the timeline card.
      const bottom = kit.timeline.getBoundingClientRect().bottom;
      ctx.ui.root.style.setProperty('--toast-top', `${Math.round(bottom + TOAST_GAP_PX)}px`);
    },

    setMode: (mode) => kit.selector.select(mode),
    dispose() {
      guide = null;
      screen.remove();
      ctx.ui.setSubtitle('');
      ctx.ui.root.style.removeProperty('--toast-top');
    },
  };
}
