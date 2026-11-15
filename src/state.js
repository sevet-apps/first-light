// Game state shell. Later tickets fill in the mission model and the assembly.

function createMission() {
  return {
    id: 'lumen-1',
    name: 'FIRST LIGHT',
    budgetMusd: 45,
    capacityKg: 180,
    goalMB: 2400,
  };
}

export const state = {
  mission: createMission(),
  assembly: {}, // slot -> partId
  lastResult: null,
  params: { debug: false, warp: 1, assembly: null }, // parsed URL params

  resetMission() {
    this.mission = createMission();
    this.assembly = {};
    this.lastResult = null;
  },
};
