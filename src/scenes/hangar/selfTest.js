// Hangar self-test: drives the real player controller into every collider, wall and corner with simulated
// input, and checks that every part and station can be focused from its standing point.
import { WALK_SPEED } from './player.js';

const rad = (d) => (d * Math.PI) / 180;
const PEN_EPS = 0.002; // allowed shortfall of the 0.35 m clearance
const TUNNEL_MIN = 0.15; // the straight path between two frames may never get this close to a surface centre line
const RUN_SECONDS = 3;

/** One simulated walk. Returns { minClearance, tunnelled, finalPos, lastSecondContacts, path } and never throws. */
function walk({ player, collision }, start, yawDeg, { dt, seconds, run }) {
  player.teleport(start.x, start.z, yawDeg, 0);
  let minClearance = Infinity;
  let tunnelled = false;
  let multiContact = false;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const prev = { x: player.pos.x, z: player.pos.z };
    player.step(dt, { forward: 1, run });
    minClearance = Math.min(minClearance, collision.clearance(player.pos.x, player.pos.z).dist);
    const len = Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z);
    for (let s = 1; s < Math.ceil(len / 0.05); s++) {
      const t = (s * 0.05) / len;
      const c = collision.clearance(prev.x + (player.pos.x - prev.x) * t, prev.z + (player.pos.z - prev.z) * t).dist;
      if (c < TUNNEL_MIN) tunnelled = true;
    }
    if (i >= steps - Math.round(1 / dt) && collision.contactIds.size >= 2) multiContact = true;
  }
  return { minClearance, tunnelled, multiContact, finalPos: { ...player.pos } };
}

const free = ({ collision }, p, margin) => collision.clearance(p.x, p.z).dist >= collision.radius + margin;

/** Face normals (world) and extents of a collider def: [{ n, extent }]. */
function faces(def) {
  if (def.shape === 'circle') {
    return Array.from({ length: 8 }, (_, i) => ({ n: { x: Math.cos((i * Math.PI) / 4), z: Math.sin((i * Math.PI) / 4) }, extent: def.r }));
  }
  const c = Math.cos(rad(def.yawDeg));
  const s = Math.sin(rad(def.yawDeg));
  return [
    { n: { x: c, z: -s }, extent: def.w / 2 },
    { n: { x: -c, z: s }, extent: def.w / 2 },
    { n: { x: s, z: c }, extent: def.d / 2 },
    { n: { x: -s, z: -c }, extent: def.d / 2 },
  ];
}

const yawFor = (dx, dz) => (Math.atan2(-dx, -dz) * 180) / Math.PI;
const rotate = (v, deg) => ({ x: v.x * Math.cos(rad(deg)) - v.z * Math.sin(rad(deg)), z: v.x * Math.sin(rad(deg)) + v.z * Math.cos(rad(deg)) });

/** Head-on and oblique approaches to every face: no penetration or tunnelling at 60 fps and at the largest frame time. */
function colliderRuns(env, def) {
  const issues = [];
  let minClearance = Infinity;
  let runs = 0;
  let slides = 0;
  for (const { n, extent } of faces(def)) {
    // Start 2.6 m from the face, or closer where props or walls crowd it.
    const start = [2.6, 1.6, 0.9].map((gap) => ({ x: def.x + n.x * (extent + gap), z: def.z + n.z * (extent + gap) })).find((p) => free(env, p, 0.02));
    if (!start) continue;
    for (const angle of [0, 40, -40]) {
      const dir = rotate({ x: -n.x, z: -n.z }, angle);
      for (const dt of [1 / 60, 0.1]) {
        const r = walk(env, start, yawFor(dir.x, dir.z), { dt, seconds: RUN_SECONDS, run: true });
        runs++;
        minClearance = Math.min(minClearance, r.minClearance);
        if (r.minClearance < env.collision.radius - PEN_EPS) issues.push(`penetration ${(r.minClearance * 1000).toFixed(0)} mm at ${angle} deg, dt ${dt.toFixed(3)}`);
        if (r.tunnelled) issues.push(`tunnelling at ${angle} deg, dt ${dt.toFixed(3)}`);
      }
      if (angle !== 0) {
        // Slide check: start close to the face, walk 1.2 s at an angle; the player must keep moving along it.
        const close = { x: def.x + n.x * (extent + env.collision.radius + 0.4), z: def.z + n.z * (extent + env.collision.radius + 0.4) };
        if (!free(env, close, 0.05)) continue;
        const r = walk(env, close, yawFor(dir.x, dir.z), { dt: 1 / 60, seconds: 1.2, run: false });
        const moved = Math.hypot(r.finalPos.x - close.x, r.finalPos.z - close.z);
        const expected = WALK_SPEED * Math.sin(rad(Math.abs(angle))) * 1.2 * 0.5;
        slides++;
        if (moved < expected && !r.multiContact) issues.push(`stuck: moved ${moved.toFixed(2)} m, expected >= ${expected.toFixed(2)} m at ${angle} deg`);
      }
    }
  }
  return { issues, minClearance, runs, slides };
}

function wallRuns(env, name, inward, startOf) {
  const issues = [];
  let minClearance = Infinity;
  for (const angle of [0, 30, -30, 60, -60]) {
    const dir = rotate(inward, angle);
    const start = startOf();
    for (const dt of [1 / 60, 0.1]) {
      const r = walk(env, start, yawFor(dir.x, dir.z), { dt, seconds: RUN_SECONDS, run: true });
      minClearance = Math.min(minClearance, r.minClearance);
      if (r.minClearance < env.collision.radius - PEN_EPS) issues.push(`penetration at ${angle} deg, dt ${dt.toFixed(3)}`);
      if (r.tunnelled) issues.push(`tunnelling at ${angle} deg, dt ${dt.toFixed(3)}`);
    }
  }
  return { name, issues, minClearance };
}

/** Run into a corner at full speed; it must settle to a still position (no jitter). */
function cornerRun(env, name, start, dir) {
  const issues = [];
  const { player, collision } = env;
  player.teleport(start.x, start.z, yawFor(dir.x, dir.z), 0);
  let maxJitter = 0;
  let minClearance = Infinity;
  for (let i = 0; i < 240; i++) {
    const prev = { x: player.pos.x, z: player.pos.z };
    player.step(1 / 60, { forward: 1, run: true });
    minClearance = Math.min(minClearance, collision.clearance(player.pos.x, player.pos.z).dist);
    if (i >= 180) maxJitter = Math.max(maxJitter, Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z));
  }
  if (minClearance < collision.radius - PEN_EPS) issues.push('penetration');
  if (maxJitter > 0.002) issues.push(`jitter ${(maxJitter * 1000).toFixed(1)} mm per frame`);
  return { name, issues, minClearance };
}

function focusChecks(hangar, layout) {
  const rows = [];
  const check = (name, station, id) => {
    hangar.gotoStation(station);
    hangar.lookAt(id);
    const f = hangar.focused();
    const ok = f?.id === id;
    rows.push({
      group: 'focus', name, pass: ok,
      detail: ok ? `${f.distance.toFixed(2)} m, "${f.verb}"` : `got ${f?.id ?? 'nothing'}`,
    });
  };
  for (const rack of layout.RACKS) for (const slot of rack.slots) check(`part ${slot.partId}`, rack.id, slot.partId);
  check('station console', 'console', 'console');
  check('station launch_ctl', 'launch_ctl', 'launch_ctl');

  hangar.gotoStation('rack_instrument');
  hangar.lookAt('inst_hri');
  hangar.player.teleport(hangar.player.get().x, hangar.player.get().z, hangar.player.get().yawDeg + 180, 0);
  rows.push({ group: 'focus', name: 'looking away clears focus', pass: hangar.focused() === null, detail: '' });

  hangar.player.teleport(layout.STATIONS.rack_instrument.x, layout.STATIONS.rack_instrument.z - 5, 180, 0);
  hangar.lookAt('inst_hri');
  rows.push({ group: 'focus', name: 'part beyond reach is not focused', pass: hangar.focused() === null, detail: '' });
  return rows;
}

function jumpChecks({ player, collision }, layout) {
  const rows = [];
  for (const dt of [1 / 60, 0.1]) {
    player.teleport(layout.SPAWN.x, layout.SPAWN.z, 0, 0);
    let apex = 0;
    let airborneSteps = 0;
    const handler = player.onFootstep;
    player.onFootstep = () => { if (!player.grounded) airborneSteps++; };
    // Holding Space must produce one jump, then leave the player on the floor.
    for (let t = 0; t < 2 - 1e-9; t += dt) {
      player.step(dt, { forward: 1, jump: true });
      apex = Math.max(apex, player.height);
    }
    rows.push({ group: 'jump', name: `jump and land at dt ${dt.toFixed(3)}`,
      pass: apex > 0.7 && apex <= 0.82 && player.height === 0 && player.grounded && airborneSteps === 0,
      detail: `apex ${apex.toFixed(2)} m; grounded ${player.grounded}; airborne footsteps ${airborneSteps}` });
    player.onFootstep = handler;

    player.step(dt, { jump: false });
    player.step(dt, { jump: true });
    const velocity = player.verticalSpeed;
    player.step(dt, { jump: false });
    player.step(dt, { jump: true });
    rows.push({ group: 'jump', name: `fresh press jumps; no double jump at dt ${dt.toFixed(3)}`,
      pass: !player.grounded && velocity > 0 && player.verticalSpeed < velocity,
      detail: `vertical speed ${velocity.toFixed(2)} → ${player.verticalSpeed.toFixed(2)} m/s` });

    player.teleport(layout.HALL.minX + collision.radius + 0.1, -3, 90, 0);
    let minClearance = Infinity;
    for (let t = 0; t < 1 - 1e-9; t += dt) {
      player.step(dt, { forward: 1, run: true, jump: true });
      minClearance = Math.min(minClearance, collision.clearance(player.pos.x, player.pos.z).dist);
    }
    rows.push({ group: 'jump', name: `jump cannot pass through walls at dt ${dt.toFixed(3)}`,
      pass: minClearance >= collision.radius - PEN_EPS && player.grounded,
      detail: `min clearance ${minClearance.toFixed(3)} m` });
  }
  return rows;
}

/** Runs everything and publishes window.__hangarSelfTest = { allPass, results }. */
export function runSelfTest(hangar, internals, layout) {
  const { player, collision } = internals;
  const env = internals;
  const saved = { ...player.get(), vel: { ...player.vel }, handler: player.onFootstep };
  player.onFootstep = null;
  const results = [];
  const row = (group, name, issues, minClearance, detail = '') => results.push({
    group, name, pass: issues.length === 0,
    detail: issues.length ? [...new Set(issues)].slice(0, 3).join('; ') : `min clearance ${Number.isFinite(minClearance) ? `${(minClearance * 1000).toFixed(0)} mm` : 'n/a'} ${detail}`.trim(),
  });

  const standing = Object.entries({ spawn: layout.SPAWN, ...layout.STATIONS });
  for (const [id, s] of standing) {
    const c = collision.clearance(s.x, s.z);
    row('standpoint', `${id} is free`, c.dist >= collision.radius ? [] : [`inside ${c.id}`], c.dist);
  }

  for (const {def} of collision.obstacles) {
    const r = colliderRuns(env, def);
    row('collider', def.id, r.issues, r.minClearance, `(${r.runs} runs, ${r.slides} slides)`);
  }

  const H = layout.HALL;
  const walls = [
    ['wall west', { x: -1, z: 0 }, () => ({ x: H.minX + 3, z: -3 })],
    ['wall east', { x: 1, z: 0 }, () => ({ x: H.maxX - 3, z: 3 })],
    ['wall north', { x: 0, z: -1 }, () => ({ x: -17, z: H.minZ + 3 })],
    ['wall south', { x: 0, z: 1 }, () => ({ x: 4, z: H.maxZ - 3 })],
  ];
  for (const [name, dir, start] of walls) {
    const r = wallRuns(env, name, dir, start);
    row('wall', name, r.issues, r.minClearance);
  }
  const d = 3 / Math.SQRT2;
  const corners = [
    ['corner north-west', { x: H.minX + 3, z: H.minZ + 3 }, { x: -d, z: -d }],
    ['corner north-east', { x: H.maxX - 3, z: H.minZ + 3 }, { x: d, z: -d }],
    ['corner south-west', { x: H.minX + 3, z: H.maxZ - 3 }, { x: -d, z: d }],
    ['corner south-east', { x: H.maxX - 3, z: H.maxZ - 3 }, { x: d, z: d }],
    ['corner launcher/tower gap', { x: -6.25, z: -9 }, { x: 0, z: -1 }],
  ];
  for (const [name, start, dir] of corners) {
    const r = cornerRun(env, name, start, dir);
    row('corner', name, r.issues, r.minClearance);
  }

  results.push(...focusChecks(hangar, layout), ...jumpChecks(env, layout));

  player.teleport(saved.x, saved.z, saved.yawDeg, saved.pitchDeg);
  player.vel.x = saved.vel.x;
  player.vel.z = saved.vel.z;
  player.onFootstep = saved.handler;
  hangar.focused();

  const allPass = results.every((r) => r.pass);
  console.table(results.map(({ group, name, pass, detail }) => ({ group, name, result: pass ? 'PASS' : 'FAIL', detail })));
  console.log(`[hangar selftest] ${allPass ? 'ALL PASS' : 'FAILURES'} (${results.filter((r) => r.pass).length}/${results.length})`);
  window.__hangarSelfTest = { allPass, results };
  return window.__hangarSelfTest;
}
