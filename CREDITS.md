# Credits and sources

## Real footage (intro film)
Cut by `tools/intro/build_video.py` from `tools/intro/edl.json` (source time ranges are before slow motion).
- **Artemis I Launch 2022 CU tracking from Press Site** (`Artemis I Launch 2022 CU tracking from Press Site_compressed~orig.mp4`) - NASA / Kennedy Space Center. Used: 24.0-28.0 s (pad at night), 42.2-44.0 s (ignition), 52.0-56.9 s (liftoff).
- **Artemis I - Rocket Camera Footage** (`Artemis I - Rocket Camera Footage~orig.mp4`, booster jettison / separation) - NASA. Used: 10.0-12.3 s (title card 0-5 s not used). https://www.nasa.gov/artemis-1
- **Launch onboard footage, upper-stage engine at sunset** (`spacex-sunset.mp4`) - onboard launch footage as distributed via NASA. Used: 6.0-9.1 s.
- **ESA video 2402_023_BR_084** (`2402_023_BR_084.mp4`) - onboard launch-vehicle cameras, (c) ESA. Used: 190.0-192.7 s (Earth fills the frame), 945.0-947.6 s (orbit view), 785.0-788.0 s (Earth limb, title fade).
- **Artemis I Orion / ICPS separation** (`jsc2022m000272_Artemis_I_Orion_ICPS_Separation_Hi-Res~orig.mp4`) - NASA / Johnson Space Center. Used: 44.0-47.8 s (solar array), 31.0-33.4 s (stage separation).

The NASA clips' own audio tracks are silent, so all launch sound in the intro is synthesised (`tools/intro/build_sfx.py`).

NASA still and moving imagery is generally not subject to copyright in the United States; it is used here for educational purposes without implying NASA endorsement. ESA material is used under ESA's terms for non-commercial/educational use with attribution. NASA and ESA logos are not used as game branding.

## Imagery
- **Blue Marble: Next Generation** and **Black Marble (Night Lights)** Earth textures — NASA Earth Observatory / NASA Visible Earth.

## Software and libraries
- [three.js](https://threejs.org) r170 — MIT License (`vendor/three/LICENSE`).
- All 3D models were created with **Blender** 5.2 via the scripts in `blender/`.
- Narration synthesized locally with **Kokoro TTS** (Apache-2.0) from an original script (`docs/INTRO_SCRIPT.md`).
- Intro music and sound design are original, synthesized with numpy/scipy (`tools/intro/build_music.py`, `build_sfx.py`).
