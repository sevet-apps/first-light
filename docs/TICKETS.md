# Ticket board

Status: `TODO` · `IN PROGRESS` · `REVIEW` · `REWORK` · `ACCEPTED`
Rule: one ticket in flight at a time; the next is issued only after the lead accepts the current one.

| # | Ticket | Status | Notes |
|---|---|---|---|
| T1 | Core skeleton: index, import map, renderer+post, scene manager, input, audio buses, settings/pause menu, debug hooks, dev server | ACCEPTED | lead-verified in browser: scene chain, no GPU leaks, menus, debug overlay |
| T2 | Mission model: component catalog, readiness checks, deterministic orbit sim, balancing harness | ACCEPTED | 54/54 tests; budget $38M forces trade-offs; fastlink rewards careful piloting. Polish later: safe-mode reason should name the activity that drained the battery |
| T2b | UI design system "Flight Manual": tokens, components, motion, UI-kit page; restyle T1 menus, title, loading, prompt, tracker | ACCEPTED | Flight Manual UI live: title, loading, menus, UI kit (parts, brief, readiness, HUD, debrief); fixed hyphen spacing and objective states |
| T3a | Hangar placeholder layout (docs/HANGAR_LAYOUT.md) + first-person controller with collisions, head-bob, footstep hooks + look-at highlight, prompts, part info cards | ACCEPTED | lead-verified on GPU: 144 fps, 180 draw calls, live walk 6.4 m/2 s, selfTest 85/85, focus + info cards OK. Later: auto-hide controls hint; light through clerestory windows (T9) |
| T3b | Assembly: pick up, carry (mass slows you), ghost preview with compatibility, install/remove/swap/return animations, live build sheet HUD | ACCEPTED | selfTest 90/90; carry/ghost/install/swap/remove verified in browser. Cost meter near-limit should be amber (fix in T3c). Perf verified on RTX 5070: 145 fps, worst frame 7 ms |
| T3c | Mission Console (brief, readiness check, integrate), integration cinematic (placeholder), Launch Control → launch scene with the assembly | ACCEPTED | console (brief/readiness/integrate), 15 s integration cinematic with crane climb, Launch Control card verified in browser; GPU check: 144 fps during the cinematic, worst frame 8 ms |
| T4 | Orbit ops + debrief + redesign loop (placeholder launch) → full playable loop | IN PROGRESS | |
| T5 | Intro film: edit from NASA/ESA footage, VO, music, SFX stems, subtitles, skip/volume, title screen | TODO | |
| T6 | Blender: satellite parts (2 buses, 2 instruments, 3 solar, 2 batteries, 3 antennas) + sockets + deploy anims + baked materials | TODO | |
| T7 | Blender: launcher (core, upper stage, 2 boosters), fairing halves, payload adapter | TODO | |
| T8 | Blender: hangar building + equipment (racks, integration stand, consoles, crane, props), colliders, baked AO | TODO | |
| T9 | Hangar art pass: integrate Blender models, lighting, haze, light shafts, dust, scale cues | TODO | |
| T10 | Launch cinematic in 3D with the assembled satellite | TODO | |
| T11 | Orbit visual pass: NASA Earth, atmosphere, clouds, night lights, stars, sun glare, eclipse | TODO | |
| T12 | Sound pass: SFX pack, ambiences, music beds, footsteps, ducking | TODO | |
| T13 | UI/UX polish, accessibility, performance pass | TODO | |
| T14 | README, credits, final verification | TODO | |
