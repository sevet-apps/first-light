// Named satellite configurations, usable as ?assembly=<name>. Also the balancing scenarios of the test page.

const make = (bus, instrument, solar, battery, antenna) => ({ bus, avionics: 'obc_1', attitude: 'adcs_1', instrument, solar, battery, antenna });

export const presets = {
  overbudget: make('bus_small', 'inst_hri', 'sol_4panel', 'bat_400', 'ant_xband'), // over budget: the priciest part of every category
  balanced: make('bus_small', 'inst_hri', 'sol_2wing', 'bat_400', 'ant_sband'),
  budget: make('bus_micro', 'inst_wfc', 'sol_2wing', 'bat_120', 'ant_sband'),
  fastlink: make('bus_small', 'inst_hri', 'sol_2wing', 'bat_120', 'ant_xband'),
  bigsolar: make('bus_small', 'inst_hri', 'sol_4panel', 'bat_120', 'ant_sband'),
  underpowered: make('bus_small', 'inst_hri', 'sol_body', 'bat_120', 'ant_xband'),
  slowlink: make('bus_small', 'inst_hri', 'sol_2wing', 'bat_400', 'ant_uhf'),
  incompatible: make('bus_micro', 'inst_hri', 'sol_2wing', 'bat_120', 'ant_xband'),
};
