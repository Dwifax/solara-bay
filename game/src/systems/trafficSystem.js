// Keeps the streets busy: spawns AI cars on lanes in a ring around the player (out of the close
// view), parks cars at the kerb, drives them with LaneDriver, removes the ones left far behind,
// runs the traffic signal phase, and makes drivers panic at gunfire or flee when carjacked.
import { LaneDriver } from './laneDriver.js';
import { lanePoint, signalStates } from './roadNavigation.js';
import { TRAFFIC_MIX } from '../data/vehicles.js';
import { OUTFITS } from '../entities/pedestrian.js';
import { dist2d } from '../core/mathUtils.js';

const MAX_TRAFFIC = 26;
const MAX_PARKED = 14;
const SPAWN_MIN = 70;
const SPAWN_MAX = 190;
const DESPAWN = 250;

export function createTrafficSystem(game) {
  const { events, rng } = game;
  let spawnTimer = 0;
  const parked = new Set();

  function countTraffic() {
    let traffic = 0;
    for (const v of game.vehicles) if (v.driver && v.driver.kind === 'traffic') traffic += 1;
    return traffic;
  }

  function spotIsFree(x, z, radius) {
    for (const v of game.vehicles) if (dist2d(x, z, v.position.x, v.position.z) < radius) return false;
    return true;
  }

  /** Is (x, z) out of the player's immediate view (behind the camera or far enough)? */
  function hiddenFromPlayer(x, z) {
    const cam = game.camera.position;
    const d = dist2d(x, z, cam.x, cam.z);
    if (d > 120) return true;
    const yaw = game.cameraCtl.state.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return (x - cam.x) * fx + (z - cam.z) * fz < 0;
  }

  function spawnMovingCar(focus) {
    const edges = game.city.network.edges;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const edge = edges[Math.floor(rng.next() * edges.length)];
      const forward = rng.next() < 0.5;
      const from = forward ? edge.a : edge.b;
      const to = forward ? edge.b : edge.a;
      const t = rng.range(18, edge.length - 18);
      const lane = rng.pick([1.9, 5.1]);
      const p = lanePoint(from, to, t, lane);
      const d = dist2d(p.x, p.z, focus.x, focus.z);
      if (d < SPAWN_MIN || d > SPAWN_MAX || !hiddenFromPlayer(p.x, p.z) || !spotIsFree(p.x, p.z, 12)) continue;
      const heading = Math.atan2(to.x - from.x, to.z - from.z);
      const v = game.vehicleSystem.spawn(rng.pick(TRAFFIC_MIX), p.x, p.z, heading);
      v.driver = new LaneDriver(v, from, to, { lane, cruise: rng.range(10, 14.5), rng, outfit: OUTFITS.civilian(rng) });
      v.forwardSpeed = 8;
      v.vx = Math.sin(heading) * 8;
      v.vz = Math.cos(heading) * 8;
      return v;
    }
    return null;
  }

  function spawnParkedCar(focus) {
    const edges = game.city.network.edges;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const edge = edges[Math.floor(rng.next() * edges.length)];
      if (edge.bridge) continue;
      const forward = rng.next() < 0.5;
      const from = forward ? edge.a : edge.b;
      const to = forward ? edge.b : edge.a;
      const t = rng.range(22, edge.length - 22);
      const p = lanePoint(from, to, t, 5.6);
      const d = dist2d(p.x, p.z, focus.x, focus.z);
      if (d < 40 || d > 160 || !hiddenFromPlayer(p.x, p.z) || !spotIsFree(p.x, p.z, 9)) continue;
      const heading = Math.atan2(to.x - from.x, to.z - from.z);
      const v = game.vehicleSystem.spawn(rng.pick(TRAFFIC_MIX), p.x, p.z, heading);
      v.controls.brake = true;
      parked.add(v);
      return v;
    }
    return null;
  }

  /** Throw a driver out of their car as a fleeing pedestrian. */
  function ejectDriver(vehicle, driver, fleeFrom) {
    const door = vehicle.doorPosition();
    const ped = game.pedSystem.spawnPed('civilian', door.x, door.z, driver.outfit ?? OUTFITS.civilian(rng));
    if (ped) game.pedSystem.makeFlee(ped, fleeFrom.x, fleeFrom.z, 10);
    return ped;
  }

  events.on('carjack', ({ vehicle, victim }) => {
    if (victim && victim.kind === 'traffic') ejectDriver(vehicle, victim, game.player.position);
  });

  events.on('gunshot', ({ x, z, byPlayer }) => {
    for (const v of game.vehicles) {
      if (v.driver && v.driver.kind === 'traffic' && dist2d(x, z, v.position.x, v.position.z) < 60) v.driver.panic = 8;
    }
    if (byPlayer) {
      // Shooting at a car's driver makes them bail out.
    }
  });

  events.on('vehicleCollision', ({ a, b }) => {
    for (const v of [a, b]) {
      if (v.driver && v.driver.kind === 'traffic' && (a.driver === 'player' || b.driver === 'player')) v.driver.panic = 6;
    }
  });

  function update(dt) {
    const focus = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const states = signalStates(game.worldTime);
    game.city.signals.update(states.ns, states.ew);

    for (const v of game.vehicles) {
      if (v.driver && v.driver.kind === 'traffic') {
        if (v.destroyed || v.sunk) {
          const driver = v.driver;
          v.driver = null;
          if (!v.destroyed) ejectDriver(v, driver, v.position);
          continue;
        }
        v.driver.update(dt, game);
        v.headlights = game.tod.state.night > 0.35;
      } else if (!v.driver) {
        v.headlights = false;
      }
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 0.25;
      if (countTraffic() < MAX_TRAFFIC * game.settings.trafficDensity) spawnMovingCar(focus);
      if (parked.size < MAX_PARKED) spawnParkedCar(focus);
      // Despawn far, unused cars.
      for (const v of game.vehicles.slice()) {
        if (v.persistent || v.driver === 'player' || v.missionTag) continue;
        if (v.driver && v.driver.kind && v.driver.kind !== 'traffic') continue;
        if (dist2d(v.position.x, v.position.z, focus.x, focus.z) > DESPAWN && hiddenFromPlayer(v.position.x, v.position.z)) {
          parked.delete(v);
          game.vehicleSystem.remove(v);
        }
      }
      for (const v of parked) if (v.driver || !game.vehicles.includes(v)) parked.delete(v);
    }
  }

  return { update, spawnMovingCar, spawnParkedCar, ejectDriver };
}
