// The three in-car radio stations: their style, tempo, harmony and the words their generated
// song and artist names are made from. All music is composed on the fly by audio/radio.js.

export const RADIO_STATIONS = [
  {
    id: 'solarafm',
    name: 'Solara FM 101.7',
    tagline: 'Neon nights, coastal drives',
    style: 'synthwave',
    bpm: 104,
    progressions: [
      [0, 5, 3, 4],
      [0, 3, 5, 4],
      [5, 3, 0, 4],
      [0, 4, 5, 3],
    ],
    minor: true,
    artists: ['Midnight Palms', 'Chrome Lagoon', 'Laser Tide', 'Velvet Grid', 'Sunset Protocol', 'The Neon Pelicans'],
    words: ['Ocean', 'Drive', 'Neon', 'Heat', 'Coastline', 'Night', 'Signal', 'Static', 'Mirage', 'Horizon', 'Velocity', 'Glow'],
  },
  {
    id: 'baybreeze',
    name: 'Bay Breeze 88.3',
    tagline: 'Tropical chill from the pier',
    style: 'tropical',
    bpm: 96,
    progressions: [
      [0, 4, 5, 3],
      [3, 4, 0, 5],
      [0, 3, 4, 4],
      [5, 3, 4, 0],
    ],
    minor: false,
    artists: ['Coral Kids', 'Lua Marino', 'Saltwater Hammock', 'Isla Verde Club', 'Driftwood Duo', 'Pelican Bay Sound'],
    words: ['Breeze', 'Mango', 'Sand', 'Lagoon', 'Sunday', 'Hammock', 'Waves', 'Palm', 'Golden', 'Island', 'Easy', 'Shells'],
  },
  {
    id: 'pulse99',
    name: 'Pulse 99.1',
    tagline: 'Bass from the block',
    style: 'dembow',
    bpm: 95,
    progressions: [
      [0, 5, 6, 4],
      [0, 3, 4, 0],
      [0, 6, 5, 6],
      [3, 4, 0, 0],
    ],
    minor: true,
    artists: ['MC Arrecife', 'La Brisa Gang', 'DJ Calloway', 'Nena Voltaje', 'Bloque Nueve', 'Tiburón'],
    words: ['Fuego', 'Calle', 'Perreo', 'Noche', 'Bajo', 'Calor', 'Ritmo', 'Barrio', 'Luna', 'Pista', 'Flow', 'Malecón'],
  },
];
