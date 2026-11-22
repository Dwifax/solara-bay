// Collects everything that should appear on the radar: fixed places (home, shops, hospital,
// police), side activities, mission blips, police units and the player's waypoint.
import { LOCATIONS } from '../data/locations.js';

const FIXED = [
  ['safehouse', 'home'],
  ['hospital', 'hospital'],
  ['police', 'police-station'],
  ['gunShop', 'gun'],
  ['dealership', 'car'],
  ['garage', 'spray'],
];

export function collectBlips(game, includePolice = true) {
  const out = [];
  for (const [id, type] of FIXED) out.push({ x: LOCATIONS[id].x, z: LOCATIONS[id].z, type, fixed: true, name: LOCATIONS[id].name });
  if (!game.missions.active) for (const b of game.activities.blips()) out.push({ ...b, fixed: true });
  for (const b of game.missions.blips()) out.push(b);
  if (includePolice && game.wanted.level > 0) {
    const flash = Math.floor(game.worldTime * 4) % 2 === 0;
    for (const v of game.vehicles) {
      if (v.isPolice && v.driver && v.driver !== 'player' && !v.destroyed) out.push({ x: v.position.x, z: v.position.z, type: 'police', flash });
    }
    for (const p of game.peds) if (p.role === 'cop' && !p.dead) out.push({ x: p.position.x, z: p.position.z, type: 'cop', flash: !flash });
    const heli = game.police.helicopter;
    if (heli) out.push({ x: heli.position.x, z: heli.position.z, type: 'heli' });
  }
  if (game.waypoint) out.push({ x: game.waypoint.x, z: game.waypoint.z, type: 'waypoint' });
  return out;
}
