// Component catalog for the FIRST LIGHT satellite. Pure data plus UI info-card helpers.
import { fmt, fmtMusd } from './format.js';

export const CATEGORIES = ['bus', 'instrument', 'solar', 'battery', 'antenna'];

export const CATEGORY_LABELS = {
  bus: 'Bus',
  instrument: 'Instrument',
  solar: 'Solar array',
  battery: 'Battery',
  antenna: 'Antenna',
};

const PARTS = [
  {
    id: 'bus_micro', category: 'bus', name: 'MB-40 Microsat Bus', shortName: 'MB-40',
    mass: 40, cost: 5,
    description: 'A compact, thrifty frame that carries a small camera and not much else.',
    stats: {
      baseLoadW: 20, storageMB: 2000, maxInstrumentKg: 12,
      allows: { solar: ['sol_body', 'sol_2wing'], antenna: ['ant_uhf', 'ant_sband'] },
    },
  },
  {
    id: 'bus_small', category: 'bus', name: 'SB-90 Smallsat Bus', shortName: 'SB-90',
    mass: 90, cost: 11,
    description: 'A sturdy, roomy backbone with big on-board memory that welcomes every payload.',
    stats: {
      baseLoadW: 40, storageMB: 8000, maxInstrumentKg: 40,
      allows: {
        solar: ['sol_body', 'sol_2wing', 'sol_4panel'],
        antenna: ['ant_uhf', 'ant_sband', 'ant_xband'],
      },
    },
  },
  {
    id: 'inst_wfc', category: 'instrument', name: 'WFC-30 Wide-Field Camera', shortName: 'WFC-30',
    mass: 9, cost: 4,
    description: 'A light, frugal camera that sweeps wide swaths but sees only the big picture.',
    stats: { powerW: 40, dataRateMBmin: 70, resolutionM: 30 },
  },
  {
    id: 'inst_hri', category: 'instrument', name: 'HRI-5 Hi-Res Multispectral Imager', shortName: 'HRI-5',
    mass: 24, cost: 15,
    description: 'A power-hungry eye sharp enough to pick a single fire front out of a forest.',
    stats: { powerW: 130, dataRateMBmin: 160, resolutionM: 5 },
  },
  {
    id: 'sol_body', category: 'solar', name: 'Body-Mounted Cells', shortName: 'Body cells',
    mass: 4, cost: 1.5,
    description: 'Solar cells glued straight onto the satellite walls: simple, light, and weak.',
    stats: { powerW: 40 },
  },
  {
    id: 'sol_2wing', category: 'solar', name: 'DSA-2 Deployable 2-Wing Array', shortName: 'DSA-2',
    mass: 12, cost: 5,
    description: 'Two folding wings that unfurl in orbit and turn sunlight into a steady supply.',
    stats: { powerW: 180 },
  },
  {
    id: 'sol_4panel', category: 'solar', name: 'DSA-4 Four-Panel Array', shortName: 'DSA-4',
    mass: 22, cost: 9,
    description: 'Four broad panels that flood the satellite with power, if the bus can hold them.',
    stats: { powerW: 320, requiresBus: ['bus_small'] },
  },
  {
    id: 'bat_120', category: 'battery', name: 'LB-120 Li-ion Pack', shortName: 'LB-120',
    mass: 3, cost: 1,
    description: 'A featherweight cell pack that gets you through the dark, barely.',
    stats: { capacityWh: 120 },
  },
  {
    id: 'bat_400', category: 'battery', name: 'LB-400 Li-ion Pack', shortName: 'LB-400',
    mass: 9, cost: 3,
    description: 'A generous reserve that shrugs off eclipses and late-night downlinks.',
    stats: { capacityWh: 400 },
  },
  {
    id: 'ant_uhf', category: 'antenna', name: 'UHF Whip', shortName: 'UHF Whip',
    mass: 1, cost: 0.5,
    description: 'A humble wire antenna: cheap, reliable, and painfully slow.',
    stats: { powerW: 8, rateMBmin: 10 },
  },
  {
    id: 'ant_sband', category: 'antenna', name: 'S-Band Patch', shortName: 'S-Band',
    mass: 2, cost: 2,
    description: 'A flat patch antenna, the dependable middle road for small missions.',
    stats: { powerW: 20, rateMBmin: 75 },
  },
  {
    id: 'ant_xband', category: 'antenna', name: 'X-Band Dish', shortName: 'X-Band',
    mass: 6, cost: 6,
    description: 'A steerable dish that empties the memory in a single ground-station pass.',
    stats: { powerW: 60, rateMBmin: 400, requiresBus: ['bus_small'] },
  },
];

export const catalog = {
  parts: PARTS,
  byId: Object.fromEntries(PARTS.map((p) => [p.id, p])),
  byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, PARTS.filter((p) => p.category === c)])),
};

export const getPart = (id) => catalog.byId[id] ?? null;

const resolutionNote = (m) =>
  m <= 10 ? 'sees small fires' : m <= 20 ? 'sees fire fronts' : 'sees only large burn scars';

/** Plain-English lines for the hangar info card: [{label, value, tone}] with tone good|neutral|warn|bad. */
export function infoLines(part) {
  const s = part.stats;
  const lines = [
    { label: 'Mass', value: `${fmt(part.mass)} kg`, tone: 'neutral' },
    { label: 'Cost', value: fmtMusd(part.cost), tone: 'neutral' },
  ];
  const add = (label, value, tone = 'neutral') => lines.push({ label, value, tone });
  const needs = (ids) => `needs ${ids.map((i) => catalog.byId[i].shortName).join(' or ')}`;

  switch (part.category) {
    case 'bus':
      add('Base power draw', `${s.baseLoadW} W, always on`, s.baseLoadW > 20 ? 'warn' : 'good');
      add('On-board memory', `${fmt(s.storageMB)} MB`, s.storageMB >= 8000 ? 'good' : 'warn');
      add('Heaviest instrument', `${s.maxInstrumentKg} kg`, s.maxInstrumentKg >= 24 ? 'good' : 'warn');
      if (!s.allows.solar.includes('sol_4panel')) add('Limits', 'no 4-panel array, no X-band dish', 'warn');
      else add('Limits', 'accepts every part', 'good');
      break;
    case 'instrument':
      add('Power draw', `${s.powerW} W while imaging`, s.powerW > 60 ? 'warn' : 'good');
      add('Data rate', `${s.dataRateMBmin} MB per minute`, s.dataRateMBmin >= 100 ? 'good' : 'neutral');
      add('Resolution', `${s.resolutionM} m — ${resolutionNote(s.resolutionM)}`, s.resolutionM <= 10 ? 'good' : 'warn');
      break;
    case 'solar':
      add('Power in sunlight', `${s.powerW} W`, s.powerW >= 180 ? 'good' : 'warn');
      if (s.requiresBus) add('Requires', needs(s.requiresBus), 'warn');
      break;
    case 'battery':
      add('Capacity', `${s.capacityWh} Wh`, s.capacityWh >= 400 ? 'good' : 'warn');
      break;
    case 'antenna':
      add('Power draw', `${s.powerW} W while transmitting`, s.powerW > 30 ? 'warn' : 'good');
      add('Downlink speed', `${s.rateMBmin} MB per minute`, s.rateMBmin >= 200 ? 'good' : s.rateMBmin >= 50 ? 'neutral' : 'bad');
      if (s.requiresBus) add('Requires', needs(s.requiresBus), 'warn');
      break;
  }
  return lines;
}
