// Mission LUMEN-1 / FIRST LIGHT: constraints, orbit parameters, objectives, brief text.

export const mission = {
  id: 'lumen-1',
  satellite: 'LUMEN-1',
  name: 'FIRST LIGHT',
  budgetMusd: 38,
  capacityKg: 180,
  goalMB: 2400,

  orbit: {
    orbits: 3,
    orbitMinutes: 95,
    eclipseFraction: 0.35,
    realSecondsPerOrbit: 80,
    altitudeKm: 550,
  },

  // Typical orbit used by the pre-launch estimates; the simulated schedule varies around it.
  nominal: {
    targetsPerOrbit: 2,
    targetMinutes: 7,
    passesPerOrbit: 2,
    passMinutes: 8,
    eclipsePassesPerOrbit: 1,
  },

  // Operating rules of the spacecraft.
  ops: {
    pointingSolarFraction: 0.55, // share of solar power available while IMAGE / DOWNLINK point away from the Sun
    safeModeMinutes: 10,
    startBatteryFraction: 0.8,
  },

  objectives: [
    {
      id: 'primary',
      title: 'Deliver the data',
      text: 'Deliver the goal amount of imagery to the ground stations within 3 orbits.',
    },
    {
      id: 'resilient',
      title: 'Resilient operations',
      text: 'Complete the mission without a single safe-mode event.',
    },
    {
      id: 'detail',
      title: 'Fire-scale detail',
      text: 'Fly an instrument with 10 m resolution or better.',
      maxResolutionM: 10,
    },
  ],

  brief: [
    'Every summer, fire races through forests and savannas faster than anyone on the ground can follow. '
      + 'The first hours decide whether a spark becomes a catastrophe, and those hours are the ones we cannot see.',
    'LUMEN-1 is our answer: a small Earth-observation satellite that circles the planet every 95 minutes '
      + 'and photographs regions at risk of wildfire. You will design it, build it with your own hands, and fly it.',
    'You have $38 million, a rocket that can lift 180 kg, and three orbits. The satellite must send at least '
      + '2 400 MB of imagery down to the ground stations. Power, memory and radio speed all pull against each other, '
      + 'and every part you choose has a price in kilograms, dollars and watts.',
    'Bring home first light.',
  ],
};

/** Stars = objectives met, but nothing counts unless the primary objective is met. */
export function starsFor(objectiveResults) {
  const primary = objectiveResults.find((o) => o.id === 'primary');
  if (!primary?.met) return 0;
  return objectiveResults.filter((o) => o.met).length;
}
