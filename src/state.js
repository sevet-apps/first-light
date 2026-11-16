// Game state: mission config, current assembly, last result, URL params.
import { mission } from './data/mission.js';

const createMission = () => structuredClone(mission);

export const state = {
  mission: createMission(),
  assembly: {}, // slot -> partId: bus, instrument, solar, battery, antenna
  lastResult: null,
  integrated: false, // the payload sits on top of the rocket (hangar integration is done)
  params: { debug: false, warp: 1, guide: true, assembly: null, integrated: false, selftest: false, assemblytest: false }, // parsed URL params

  resetMission() {
    this.mission = createMission();
    this.assembly = {};
    this.lastResult = null;
    this.integrated = false;
  },
};
