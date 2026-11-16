// Assembly self-test: assembles every integrable preset, checks socket transforms, refusals, swap, remove and
// put-back rules, the weight model and the build sheet, inside the real hangar scene.
// Publishes window.__assemblySelfTest = { allPass, results }.
import * as THREE from 'three';
import { CATEGORIES, getPart } from '../../data/components.js';
import { presets } from '../../data/presets.js';
import { BUS_SOCKETS } from '../../data/sockets.js';
import { evaluateAssembly } from '../../sim/assembly.js';
import { sheetFigures } from '../../ui/buildSheet.js';
import { MIN_SPEED, speedMultiplierFor } from './carry.js';

const EPS = 1e-4;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (a, b, eps = EPS) => Math.abs(a - b) <= eps;
const sameMatrix = (a, b) => a.elements.every((v, i) => near(v, b.elements[i], 1e-3));

/** @param {import('./assembly.js').Assembly} a */
export async function runAssemblySelfTest(a, hangar, ctx) {
  const results = [];
  const check = (group, name, pass, detail = '') => results.push({ group, name, pass: !!pass, detail: String(detail) });
  const mission = ctx.state.mission;
  const saved = { player: hangar.player.get(), assembly: { ...ctx.state.assembly } };
  const live = () => {
    a.interaction.refresh();
    a.update(1 / 60);
  };
  const promptText = () => ctx.ui.promptEl.textContent;

  // ---- 1. every integrable preset, assembled instantly
  const integrable = Object.keys(presets).filter((n) => evaluateAssembly(presets[n], mission).canIntegrate);
  check('preset', 'integrable presets found', integrable.length >= 4, integrable.join(', '));
  for (const name of integrable) {
    const want = presets[name];
    const r = await a.autoAssemble(name);
    const state = a.get();
    check('preset', `${name}: all parts installed`, r.refused.length === 0 && CATEGORIES.every((c) => state.installed[c] === want[c]), JSON.stringify(state.installed));
    check('preset', `${name}: state.assembly mirrors the stand`, CATEGORIES.every((c) => ctx.state.assembly[c] === want[c]));

    const bus = a.satellite.slots.get('bus');
    const sockets = BUS_SOCKETS[bus.id];
    const busNode = bus.root.userData.nodes.main;
    let socketsOk = true;
    for (const [socketName, def] of Object.entries(sockets)) {
      const s = busNode.getObjectByName(`SOCKET_${socketName}`);
      if (!s || !def.position.every((v, i) => near(s.position.getComponent(i), v))) socketsOk = false;
    }
    check('socket', `${name}: bus ${bus.id} carries SOCKET_* empties from data`, socketsOk);

    a.satellite.root.updateMatrixWorld(true);
    let transformsOk = true;
    let bad = '';
    for (const part of a.satellite.slots.values()) {
      const busId = bus.id;
      for (const m of part.mounts) {
        const node = part.installedNode(m, busId);
        const expected = a.satellite.root.matrixWorld.clone().multiply(a.satellite.socketMatrix(m.socket, busId)).multiply(m.offset);
        node.updateWorldMatrix(true, false);
        if (!sameMatrix(node.matrixWorld, expected) || !node.visible) { transformsOk = false; bad = `${part.id}/${m.socket}`; }
      }
    }
    check('socket', `${name}: every node sits on its socket transform`, transformsOk, bad);

    const solar = a.satellite.slots.get('solar');
    const wings = solar.def.id === 'sol_body' ? null : [solar.root.userData.nodes.wing_px, solar.root.userData.nodes.wing_nx];
    if (wings) {
      const world = wings.map((w) => new THREE.Vector3().setFromMatrixPosition(w.matrixWorld).x - a.satellite.root.position.x);
      check('socket', `${name}: ${solar.id} split into wing_px (+X) and wing_nx (-X)`, world[0] > 0.25 && world[1] < -0.25, world.map((v) => v.toFixed(2)).join(' / '));
    } else {
      const fitted = solar.root.userData.nodes[`fit_${bus.id}`];
      check('socket', `${name}: body cells use the fit_${bus.id} variant`, fitted.visible && !solar.root.userData.nodes.stack.visible);
    }

    const totals = evaluateAssembly(want, mission).totals;
    const figures = sheetFigures(ctx.state.assembly, mission);
    const sheetNums = [...a.sheet.node.querySelectorAll('.meter__value')].map((n) => Number(n.dataset.value));
    check('sheet', `${name}: build sheet matches evaluateAssembly (mass ${totals.mass} kg, $${totals.cost} M)`,
      near(figures.mass, totals.mass) && near(figures.cost, totals.cost) && near(sheetNums[0], totals.mass) && near(sheetNums[1], totals.cost), sheetNums.join(' / '));
    check('objective', `${name}: objective advances once everything is installed`, a.objectives.state.installed.length === CATEGORIES.length);
  }

  // ---- 2. refused installs, with reasons
  const refusal = async (name, partIds, expected) => {
    await a.autoAssemble({});
    for (const id of partIds.slice(0, -1)) {
      await a.pick(id, { instant: true });
      await a.install({ instant: true });
    }
    const last = partIds.at(-1);
    await a.pick(last, { instant: true });
    const verdict = a.evaluate(a.carrying);
    const before = JSON.stringify(ctx.state.assembly);
    const attempt = await a.install({ instant: true });
    check('refusal', name, !verdict.ok && !attempt.ok && verdict.reason.includes(expected) && JSON.stringify(ctx.state.assembly) === before, verdict.reason);
    await a.putBack({ instant: true });
  };
  await refusal('micro bus + HRI-5 is refused (mass limit of the bus)', ['bus_micro', 'inst_hri'], '12 kg');
  await refusal('micro bus + X-band is refused (needs SB-90)', ['bus_micro', 'ant_xband'], 'SB-90');
  await refusal('micro bus + DSA-4 is refused (needs SB-90)', ['bus_micro', 'sol_4panel'], 'SB-90');
  await refusal('a part before the bus is refused', ['inst_wfc'], 'Install a bus first');

  // ---- 3. ghost colour and prompts while looking at the stand
  await a.autoAssemble({});
  await a.pick('bus_micro', { instant: true });
  await a.install({ instant: true });
  await a.pick('inst_hri', { instant: true });
  hangar.gotoStation('stand');
  hangar.lookAt('satellite');
  live();
  check('ghost', 'invalid part: red ghost shown at the stand', a.ghost.group.visible && !a.ghost.valid && a.ghost.material.color.r > 0.5 && a.ghost.material.color.g < 0.3);
  check('ghost', 'invalid part: prompt carries the reason', promptText().includes('12 kg'), promptText());
  await a.putBack({ instant: true });
  await a.pick('inst_wfc', { instant: true });
  live();
  check('ghost', 'valid part: paper-white ghost', a.ghost.group.visible && a.ghost.valid && a.ghost.material.color.g > 0.8);
  check('ghost', 'valid part: prompt reads Install · name', /Install/.test(promptText()) && promptText().includes('WFC-30'), promptText());
  check('ghost', 'ghost sits on the instrument socket', (() => {
    const clone = a.ghost.copies.get('inst_wfc').get('main');
    const expected = a.satellite.socketMatrix('instrument', 'bus_micro');
    return near(clone.position.y, new THREE.Vector3().setFromMatrixPosition(expected).y);
  })());
  hangar.lookAt('inst_hri');
  live();
  check('ghost', 'ghost hides when looking away', !a.ghost.group.visible);
  await a.putBack({ instant: true });

  // ---- 4. swap, remove rules, put back
  await a.autoAssemble('balanced');
  await a.pick('inst_wfc', { instant: true });
  hangar.lookAt('satellite');
  live();
  check('swap', 'prompt says Swap when the slot is taken', /Swap/.test(promptText()), promptText());
  const swapped = await a.install({ instant: true });
  const afterSwap = a.get();
  check('swap', 'swap: new part installed, old part in hands', swapped.ok && afterSwap.installed.instrument === 'inst_wfc' && afterSwap.carrying === 'inst_hri' && ctx.state.assembly.instrument === 'inst_wfc');
  check('swap', 'swapped-out part carries weight again', near(a.player.speedMultiplier, 1 - (1 - MIN_SPEED) * ((24 - 5) / 85), 0.005), a.player.speedMultiplier.toFixed(3));
  await a.putBack({ instant: true });
  check('putback', 'put back: part is on its rack slot again', (() => {
    const hri = a.parts.get('inst_hri');
    const slot = hangar.layout.RACKS.flatMap((r) => r.slots).find((s) => s.partId === 'inst_hri');
    return hri.state === 'rack' && near(hri.root.position.x, slot.x) && near(hri.root.position.z, slot.z) && near(hri.root.position.y, hangar.layout.RACK_TOP) && near(hri.root.scale.x, 1);
  })());
  check('putback', 'put back: hands free, speed normal', a.carrying === null && a.player.speedMultiplier === 1 && a.player.weight === 0);

  const refusedBus = await a.remove('bus', { instant: true });
  check('remove', 'bus cannot be removed while other parts are installed', !refusedBus.ok && /other parts/.test(refusedBus.reason) && a.get().installed.bus === 'bus_small', refusedBus.reason);
  const removed = await a.remove('antenna', { instant: true });
  check('remove', 'remove: part goes into the hands and out of state.assembly', removed.ok && a.carrying?.id === 'ant_sband' && !('antenna' in ctx.state.assembly));
  const second = await a.remove('solar', { instant: true });
  check('remove', 'cannot remove while hands are full', !second.ok && /hands/.test(second.reason));
  const grabAgain = await a.pick('bat_120', { instant: true });
  check('carry', 'only one part at a time', !grabAgain.ok);
  await a.putBack({ instant: true });
  await a.autoAssemble({});
  await a.pick('bus_small', { instant: true });
  await a.install({ instant: true });
  const lone = await a.remove('bus', { instant: true });
  check('remove', 'bus can be removed when nothing else is installed', lone.ok && a.carrying?.id === 'bus_small' && Object.keys(ctx.state.assembly).length === 0);
  await a.putBack({ instant: true });

  // ---- 5. weight model
  const speeds = {};
  for (const id of ['ant_uhf', 'inst_wfc', 'inst_hri', 'bus_micro', 'bus_small']) {
    await a.pick(id, { instant: true });
    speeds[id] = a.player.speedMultiplier;
    await a.putBack({ instant: true });
  }
  check('weight', 'light parts (<= 5 kg) do not slow you', speeds.ant_uhf === 1, JSON.stringify(speeds));
  check('weight', 'speed falls with mass, x0.6 at 90 kg', speeds.inst_wfc < 1 && speeds.inst_hri < speeds.inst_wfc && speeds.bus_micro < speeds.inst_hri && speeds.bus_small < speeds.bus_micro && near(speedMultiplierFor(90), 0.6, 0.001));

  // ---- 6. deltas on the build sheet
  await a.autoAssemble('balanced');
  await a.pick('sol_4panel', { instant: true });
  const chips = [...a.sheet.node.querySelectorAll('.sheet__delta')].filter((c) => !c.hidden);
  const costChip = a.sheet.node.querySelectorAll('.sheet__readout')[1].querySelector('.sheet__delta');
  const massChip = a.sheet.node.querySelectorAll('.sheet__readout')[0].querySelector('.sheet__delta');
  check('sheet', 'carrying DSA-4 over DSA-2 shows +10 kg and +$4 M', /\+10 kg/.test(massChip.textContent) && /\+\$4\s*M/.test(costChip.textContent), `${massChip.textContent} | ${costChip.textContent}`);
  check('sheet', 'delta turns red when it would exceed the budget ($36 M + $4 M > $38 M)', costChip.classList.contains('is-over') && !massChip.classList.contains('is-over'), chips.length);
  await a.putBack({ instant: true });
  check('sheet', 'deltas clear when the part goes back', [...a.sheet.node.querySelectorAll('.sheet__delta')].every((c) => c.hidden));

  // ---- 7. real interaction path and animation guards
  const until = async (fn, ms = 10000) => {
    for (let t = 0; t < ms && !fn(); t += 50) await wait(50);
    return fn();
  };
  await a.autoAssemble({});
  hangar.gotoStation('rack_bus');
  hangar.lookAt('bus_small');
  check('interact', 'rack part is focused with the Pick up prompt', hangar.focused()?.id === 'bus_small' && /Pick up/.test(promptText()), promptText());
  hangar.interact();
  check('interact', 'E on the part starts the pick-up', a.carrying?.id === 'bus_small' && a.busy);
  hangar.interact();
  check('interact', 'a second E during the animation is ignored', a.carrying?.id === 'bus_small' && a.busy);
  check('interact', 'pick-up animation ends with the part in hands', await until(() => !a.busy) && a.carrying?.state === 'carried');
  hangar.gotoStation('stand');
  hangar.lookAt('satellite');
  live();
  hangar.interact();
  const started = a.busy;
  const left = await until(() => a.carrying === null);
  check('interact', 'E on the ghost starts the install: part leaves the hands', started && left && a.parts.get('bus_small').state === 'moving',
    JSON.stringify({ started, left, state: a.parts.get('bus_small').state, focus: hangar.focused()?.id }));
  hangar.interact();
  const secondTry = await a.install();
  check('interact', 'a second press during the install is ignored', a.busy && !secondTry.ok, secondTry.reason);
  check('interact', 'install animation completes with the part seated and four bolts', await until(() => !a.busy)
    && a.get().installed.bus === 'bus_small' && a.fx.bolts.count(a.parts.get('bus_small')) === 4);
  const sounds = a.get().sounds;
  check('interact', 'sound hooks fired: pickup, install_clunk, torque', ['pickup', 'install_clunk', 'torque'].every((s) => sounds.includes(s)), sounds.join(','));

  // pause menu opened in the middle of an install must not stall or break the animation
  await a.pick('inst_wfc', { instant: true });
  const running = a.install();
  ctx.menus.openPause();
  await running;
  ctx.menus.close();
  check('interact', 'pause menu opened mid-install: animation still completes', a.get().installed.instrument === 'inst_wfc' && !a.busy);

  // E on an installed part removes it (look at the satellite with free hands)
  hangar.lookAt('satellite');
  live();
  check('interact', 'free hands: looking at the satellite offers Remove', hangar.focused()?.kind === 'installed' && /Remove/.test(promptText()), promptText());

  // ---- finish: clean stand
  await a.autoAssemble({});
  for (const [id, part] of a.parts) check('final', `${id} back on the rack`, part.state === 'rack');
  await a.autoAssemble(saved.assembly);
  hangar.player.teleport(saved.player.x, saved.player.z, saved.player.yawDeg, saved.player.pitchDeg);

  const allPass = results.every((r) => r.pass);
  console.table(results.map(({ group, name, pass, detail }) => ({ group, name, result: pass ? 'PASS' : 'FAIL', detail })));
  console.log(`[assembly selftest] ${allPass ? 'ALL PASS' : 'FAILURES'} (${results.filter((r) => r.pass).length}/${results.length})`);
  window.__assemblySelfTest = { allPass, results };
  return window.__assemblySelfTest;
}
