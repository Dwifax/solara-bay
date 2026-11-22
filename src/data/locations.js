// Named places on the map: shops, services and where the player wakes up after being wasted or
// busted. Positions are on the sidewalk in front of each building.

export const LOCATIONS = {
  safehouse: { name: "Sol's Place", x: -150, z: 93, blip: 'home', heading: Math.PI },
  hospital: { name: 'St. Marisol General', x: -350, z: -8, blip: 'hospital', heading: 0 },
  police: { name: 'SBPD Central', x: 40, z: -107, blip: 'police', heading: 0 },
  gunShop: { name: 'Bayline Arms', x: 150, z: 8, blip: 'gun', heading: Math.PI },
  dealership: { name: 'Coastline Motors', x: 242, z: -107, blip: 'car', heading: 0 },
  garage: { name: 'Sunset Customs', x: 50, z: 108, blip: 'spray', heading: Math.PI },
  bennys: { name: "Benny's Bait & Tackle", x: 550, z: -92, blip: 'B', heading: Math.PI },
  courier: { name: 'Bayline Couriers', x: 108, z: -250, blip: 'job', heading: Math.PI / 2 },
  raceStart: { name: 'Street Races', x: -300, z: 293, blip: 'race', heading: Math.PI / 2 },
};

/** Where purchased cars are delivered and where the player can grab a car near home. */
export const PARKING_SPOTS = [
  { x: -175, z: 105.2, heading: Math.PI / 2 },
  { x: 260, z: -104, heading: -Math.PI / 2 },
];
