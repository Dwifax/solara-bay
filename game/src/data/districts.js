// The districts of Solara Bay: names, the building style of their blocks and the palette they use.

export const DISTRICTS = {
  meridian: {
    name: 'Meridian Downtown',
    style: 'towers',
    palette: [0xdfe6ea, 0xb9c7d0, 0x9fb4c2, 0xe8dccb, 0x8fa3ad, 0xc9d3d8, 0xf1ece2],
  },
  halcyon: {
    name: 'Halcyon Strand',
    style: 'deco',
    palette: [0xf7c6c7, 0xfde2b8, 0xbfe6dd, 0xf5f0e1, 0xc8d7f5, 0xf9d5e5, 0xffe8a3, 0xa8e0e6],
  },
  littleCoral: {
    name: 'Little Coral',
    style: 'midrise',
    palette: [0xf2a477, 0xe8c07a, 0xd98c73, 0xf0dcc0, 0x9cc9b3, 0xe7b8a2, 0xc2d6a3, 0xf4e1c1],
  },
  palmetto: {
    name: 'Palmetto Gardens',
    style: 'houses',
    palette: [0xf6e7c8, 0xe9d3b0, 0xcfe3d6, 0xf3d1c4, 0xdcd2ec, 0xfff1d6, 0xd7ead0],
  },
  vistaHills: {
    name: 'Vista Hills',
    style: 'villas',
    palette: [0xfaf6ee, 0xf1e6d2, 0xe6efe9, 0xf6ecdf],
  },
  riverside: {
    name: 'Riverside Works',
    style: 'warehouses',
    palette: [0xb8a48c, 0x9c8f80, 0xc9b79c, 0x8d9aa0, 0xa9a090, 0xc4876a],
  },
  portCalloway: {
    name: 'Port Calloway Docks',
    style: 'docks',
    palette: [0x7f8c8d, 0x9aa5a8, 0xb0a18a, 0x6f7f86],
  },
  beach: {
    name: 'Solara Beach',
    style: 'beach',
    palette: [0xf3e2bd],
  },
  bridge: {
    name: 'Solara Bay Bridge',
    style: 'bridge',
    palette: [0xd0d0d0],
  },
};

/** Which district a world position lies in. */
export function districtAt(x, z) {
  if (x > 445) return 'portCalloway';
  if (x > 345) return 'bridge';
  if (z > 312) return 'beach';
  if (z > 150) return 'halcyon';
  if (z < -420) return 'vistaHills';
  if (x < -250) return 'palmetto';
  if (z < -80 && x < 150) return 'meridian';
  if (z < -80) return 'riverside';
  return 'littleCoral';
}
