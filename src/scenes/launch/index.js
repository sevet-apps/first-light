// Launch placeholder: countdown, a rocket rising on its flame, fade to black, "Orbit insertion confirmed", orbit.
// About ten seconds, skippable. T10 replaces the world with the real cinematic of the player's rocket.
import { disposeObject3D } from '../../core/sceneManager.js';
import { button, documentCard, el, keyCap, microLabel } from '../../core/ui.js';
import { presets } from '../../data/presets.js';
import { CATEGORIES, getPart } from '../../data/components.js';
import { stagger } from '../../ui/motion.js';
import { createLaunchWorld } from './world.js';

const COUNTDOWN_SECONDS = 5; // T-5 ... T-0, one number per second
const ASCENT_SECONDS = 3.2;
const FADE_SECONDS = 0.9;
const CARD_SECONDS = 2.6; // how long the insertion card waits for a click before moving on
const BLOOM = { strength: 0.6, radius: 0.6, threshold: 0.85 };

const STATUS = [
  [0, 'Terminal count'],
  [3, 'Engine ignition sequence'],
  [COUNTDOWN_SECONDS, 'Liftoff'],
  [COUNTDOWN_SECONDS + 1.6, 'Climbing to orbit'],
];
const statusAt = (time) => STATUS.filter(([from]) => time >= from).at(-1)[1];

let session = null;

function buildClock() {
  const card = el('div', 'night launch-clock enter');
  const time = el('span', 'launch-clock__time', 'T−05');
  const status = el('span', 'launch-clock__status');
  card.append(microLabel('Launch sequence · LUMEN-1'), time, status);
  return { card, time, status };
}

function insertionCard(assembly, mission, onContinue) {
  const card = documentCard({ code: 'FL-DOC-004', index: '04 / 05', label: 'Flight dynamics', title: 'Orbit insertion confirmed', marks: true, className: 'insertion' });
  const solar = getPart(assembly.solar);
  const lines = el('ul', 'insertion__lines');
  for (const text of [
    `LUMEN-1 is in a ${mission.orbit.altitudeKm} km sun-synchronous orbit.`,
    solar.id === 'sol_body' ? 'Body-mounted cells are generating power.' : `${solar.shortName} solar wings deployed.`,
    `Three orbits of ${mission.orbit.orbitMinutes} minutes ahead. Bring home first light.`,
  ]) lines.append(el('li', '', text));
  const actions = el('div', 'btn-row doc__actions');
  actions.append(button('Continue', 'primary', onContinue, { icon: 'arrow' }));
  card.body.append(lines, actions);
  stagger(card.body);
  return card;
}

export default {
  id: 'launch',
  pausable: true,

  /** params.assembly: the integrated build, handed on to the orbit scene. */
  async enter(ctx, params = {}) {
    const complete = (a) => CATEGORIES.every((c) => a?.[c]);
    const assembly = [params.assembly, ctx.state.assembly].find(complete) ?? presets.balanced;
    const world = createLaunchWorld({ ignitionTime: COUNTDOWN_SECONDS });
    ctx.renderer.setView(world.scene, world.camera, { bloom: BLOOM });

    const screen = ctx.ui.screen('screen--launch', true);
    const blackout = el('div', 'launch-blackout');
    const clock = buildClock();
    const skip = el('div', 'launch-skip');
    skip.append(keyCap('Space', { night: true }), button('Skip', 'ghost', () => proceed()));
    screen.append(blackout, clock.card, skip);

    const s = { ctx, assembly, world, screen, blackout, clock, elapsed: 0, card: null, cardTime: 0, leaving: false };
    session = s;
    const proceed = async () => {
      if (s.leaving) return;
      s.leaving = true;
      if (!(await ctx.scenes.goto('orbit', { assembly }))) s.leaving = false; // refused while this scene is still fading in
    };
    s.proceed = proceed;
    world.update(0);
    window.__fl.launch = { skip: proceed, get time() { return s.elapsed; } };
  },

  update(dt) {
    const s = session;
    if (s.ctx.menus.mode !== null || s.leaving) return;
    s.elapsed += dt;
    if (s.ctx.input.pressed('Space') || s.ctx.input.pressed('Enter')) s.proceed();
    s.world.update(s.elapsed);

    const { clock } = s;
    const toLiftoff = COUNTDOWN_SECONDS - s.elapsed;
    clock.time.textContent = toLiftoff > 0 ? `T−${String(Math.ceil(toLiftoff)).padStart(2, '0')}` : `T+${String(Math.floor(-toLiftoff)).padStart(2, '0')}`;
    clock.status.textContent = statusAt(s.elapsed);

    const blackStart = COUNTDOWN_SECONDS + ASCENT_SECONDS;
    s.blackout.style.opacity = String(Math.min(1, Math.max(0, (s.elapsed - blackStart) / FADE_SECONDS)));
    if (s.elapsed >= blackStart + FADE_SECONDS && !s.card) {
      clock.card.remove();
      s.card = insertionCard(s.assembly, s.ctx.state.mission, s.proceed);
      s.screen.append(s.card);
    }
    if (s.card) {
      s.cardTime += dt;
      if (s.cardTime > CARD_SECONDS) s.proceed();
    }
  },

  exit() {
    delete window.__fl.launch;
    session.screen.remove();
    disposeObject3D(session.world.scene);
    session = null;
  },
};
