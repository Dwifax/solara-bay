// Vehicle handling and looks. Speeds are in m/s; grip is how quickly sideways slip is killed
// (low grip drifts), steer is the maximum front-wheel angle in radians.

export const VEHICLES = {
  marlin: { id: 'marlin', name: 'Marlin Sedan', model: 'sedan', length: 4.6, width: 1.9, maxSpeed: 44, accel: 10, brake: 22, grip: 7.5, steer: 0.62, health: 1000, mass: 1.0, price: 9000, level: 1, colors: [0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x16a085, 0x8e9aa8, 0x1f3a93] },
  vento: { id: 'vento', name: 'Vento GT', model: 'sports', length: 4.4, width: 1.95, maxSpeed: 66, accel: 17, brake: 28, grip: 9.5, steer: 0.55, health: 800, mass: 0.9, price: 48000, level: 4, colors: [0xffd400, 0xe63946, 0x00b4d8, 0xff7b00, 0xf1f1f1, 0x8338ec] },
  brawler: { id: 'brawler', name: 'Brawler SS', model: 'muscle', length: 4.9, width: 2.0, maxSpeed: 56, accel: 14, brake: 20, grip: 5.6, steer: 0.6, health: 1100, mass: 1.15, price: 26000, level: 3, colors: [0x111111, 0xd62828, 0xf77f00, 0x2a9d8f, 0x6a4c93] },
  dune: { id: 'dune', name: 'Dune Hauler', model: 'pickup', length: 5.2, width: 2.1, maxSpeed: 40, accel: 9, brake: 18, grip: 6.8, steer: 0.58, health: 1400, mass: 1.4, price: 15000, level: 2, colors: [0x8d99ae, 0x6b705c, 0xbc4749, 0x264653, 0xe9c46a] },
  coaster: { id: 'coaster', name: 'Coaster Van', model: 'van', length: 5.4, width: 2.15, maxSpeed: 34, accel: 7, brake: 16, grip: 6.2, steer: 0.55, health: 1500, mass: 1.6, price: 12000, level: 1, colors: [0xf1f1f1, 0x457b9d, 0xe9d8a6, 0x94a3b8] },
  pip: { id: 'pip', name: 'Pip Hatch', model: 'compact', length: 3.8, width: 1.75, maxSpeed: 38, accel: 10, brake: 22, grip: 8, steer: 0.7, health: 750, mass: 0.8, price: 6000, level: 1, colors: [0x90be6d, 0xf9c74f, 0xf94144, 0x43aa8b, 0xf8961e, 0x577590] },
  cab: { id: 'cab', name: 'Bay Cab', model: 'taxi', length: 4.6, width: 1.9, maxSpeed: 42, accel: 10, brake: 22, grip: 7.5, steer: 0.62, health: 1000, mass: 1.0, price: 0, level: 99, colors: [0xffc300] },
  interceptor: { id: 'interceptor', name: 'SBPD Interceptor', model: 'police', length: 4.8, width: 1.95, maxSpeed: 54, accel: 14, brake: 26, grip: 8.5, steer: 0.6, health: 1400, mass: 1.2, price: 0, level: 99, colors: [0xf4f6f8] },
  reefer: { id: 'reefer', name: 'Reefer Truck', model: 'truck', length: 6.6, width: 2.3, maxSpeed: 30, accel: 6, brake: 14, grip: 6, steer: 0.5, health: 2000, mass: 2.0, price: 0, level: 99, colors: [0xf4f4f4] },
};

/** Cars that appear in ordinary traffic, weighted by how common they are. */
export const TRAFFIC_MIX = ['marlin', 'marlin', 'marlin', 'pip', 'pip', 'coaster', 'dune', 'dune', 'cab', 'brawler', 'vento'];

/** Cars sold at Coastline Motors. */
export const DEALER_STOCK = ['pip', 'marlin', 'dune', 'brawler', 'vento'];
