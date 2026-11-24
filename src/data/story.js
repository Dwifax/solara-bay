// The cast of Solara Bay. Sol Navarro, a getaway driver who left town four years ago, comes back
// to pull her little brother out of debt to the dock gang and finds the debt is the smallest
// part of a land grab by the city's richest developer.

export const CHARACTERS = {
  sol: { name: 'Sol', full: 'Sol Navarro', color: '#ff7a8a', role: 'You. Ex-wheelwoman, back in town.' },
  kiko: { name: 'Kiko', full: 'Kiko Navarro', color: '#7fd8ff', role: "Sol's little brother. Owes the wrong people." },
  benny: { name: 'Benny', full: 'Benicio "Tío Benny" Ruiz', color: '#ffd166', role: 'Your uncle. Runs the bait shop, knows everyone at the docks.' },
  dez: { name: 'Dez', full: 'Desmond "Dez" Okafor', color: '#9cff8a', role: 'Hacker, phone-repair genius, Kiko\'s roommate.' },
  juno: { name: 'Juno', full: 'Juno Park', color: '#ff9cf2', role: 'Queen of the Halcyon Strand night races.' },
  gull: { name: 'Gull', full: 'Marco "Gull" Gallo', color: '#4fd1c5', role: 'Boss of the Gulls, the dock gang.' },
  vera: { name: 'Vera', full: 'Vera Castellane', color: '#e0b0ff', role: 'Developer. Owns half the skyline, wants the rest.' },
  ward: { name: 'Capt. Ward', full: 'Captain Hollis Ward', color: '#8fb3ff', role: 'SBPD captain with a second paycheck.' },
  radio: { name: 'Dispatch', full: 'SBPD Dispatch', color: '#b8c7d9', role: 'Police radio.' },
};

/** Street creds: XP needed and the title shown on the stats screen. */
export const RESPECT_LEVELS = [
  { xp: 0, title: 'Newcomer' },
  { xp: 300, title: 'Street Runner' },
  { xp: 800, title: 'Wheelwoman' },
  { xp: 1500, title: 'Hustler' },
  { xp: 2500, title: 'Operator' },
  { xp: 3800, title: 'Shot Caller' },
  { xp: 5400, title: 'Boss of the Block' },
  { xp: 7400, title: 'Bay Legend' },
  { xp: 10000, title: 'Kingpin' },
  { xp: 13500, title: 'Queen of the Bay' },
];
