// Police response to the wanted level. Cruisers spawn out of sight and route along the streets to
// the last sighting, then chase and ram; when the player is on foot officers jump out and fight.
// From three stars roadblocks close streets ahead, from four the helicopter circles with its
// searchlight. Without a wanted level a few patrol cars drive with traffic.
import { LaneDriver } from './laneDriver.js';
import { findRoute, lanePoint } from './roadNavigation.js';
import { nearestNode, nearestRoadPoint } from '../world/cityLayout.js';
import { OUTFITS } from '../entities/pedestrian.js';
import { Helicopter } from '../entities/helicopter.js';
import { clamp, angleDelta, headingTo, dist2d } from '../core/mathUtils.js';

const CARS_BY_LEVEL = [0, 1, 2, 3, 4, 5];
const MAX_FOOT_COPS = [0, 2, 4, 6, 8, 10];

/** AI for a police cruiser in pursuit. */
class PursuitDriver {
  constructor(vehicle, game) {
    this.kind = 'police';
    this.vehicle = vehicle;
    this.game = game;
    this.route = null;
    this.routeIndex = 0;
    this.repath = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.deployed = false;
    this.crew = 2;
    this.aggression = 0.7 + game.rng.next() * 0.3;
  }

  update(dt) {
    const game = this.game;
    const v = this.vehicle;
    const c = v.controls;
    const wanted = game.wanted.state;
    const player = game.player;
    const target = player.vehicle ? player.vehicle.position : player.position;
    const seenRecently = wanted.unseenTime < 3;
    const goalX = seenRecently ? target.x : wanted.lastSeenX;
    const goalZ = seenRecently ? target.z : wanted.lastSeenZ;
    const d = dist2d(v.position.x, v.position.z, goalX, goalZ);
    v.sirenOn = true;
    v.headlights = game.tod.state.night > 0.35;

    // Officers bail out to chase a player on foot.
    if (!player.vehicle && d < 24 && seenRecently && !this.deployed) {
      c.throttle = 0;
      c.brake = true;
      c.steer = 0;
      if (v.speed < 2) game.police.deployOfficers(v, this);
      return;
    }
    if (this.deployed) {
      c.throttle = 0;
      c.brake = true;
      return;
    }

    let tx;
    let tz;
    let desiredSpeed = 34;
    const direct = d < 50 && game.city.collision.lineClear(v.position.x, 1.2, v.position.z, goalX, 1.2, goalZ);
    if (direct) {
      // Aim slightly ahead of a moving target to ram it.
      const pv = player.vehicle;
      const lead = pv ? Math.min(1.2, d / 30) : 0;
      tx = goalX + (pv ? pv.vx * lead : 0);
      tz = goalZ + (pv ? pv.vz * lead : 0);
      desiredSpeed = pv ? Math.max(14, pv.speed + 8 * this.aggression) : Math.min(14, d * 0.6);
    } else {
      this.repath -= dt;
      if (!this.route || this.repath <= 0) {
        this.repath = 2.5;
        const start = nearestNode(game.city.network, v.position.x + Math.sin(v.heading) * 15, v.position.z + Math.cos(v.heading) * 15);
        const goal = nearestNode(game.city.network, goalX, goalZ);
        this.route = findRoute(game.city.network, start, goal);
        this.routeIndex = 0;
      }
      if (this.route && this.route.length > 0) {
        while (this.routeIndex < this.route.length - 1 && dist2d(v.position.x, v.position.z, this.route[this.routeIndex].x, this.route[this.routeIndex].z) < 9) this.routeIndex += 1;
        const node = this.route[this.routeIndex];
        const prev = this.routeIndex > 0 ? this.route[this.routeIndex - 1] : null;
        if (prev) {
          const p = lanePoint(prev, node, Math.max(0, Math.hypot(node.x - prev.x, node.z - prev.z) - 2), 1.8);
          tx = p.x;
          tz = p.z;
        } else {
          tx = node.x;
          tz = node.z;
        }
        const dn = dist2d(v.position.x, v.position.z, node.x, node.z);
        if (dn < 26 && this.routeIndex < this.route.length - 1) desiredSpeed = 13;
        if (this.routeIndex === this.route.length - 1 && dn < 12) {
          tx = goalX;
          tz = goalZ;
          desiredSpeed = 12;
        }
      } else {
        tx = goalX;
        tz = goalZ;
      }
    }

    if (this.reverse > 0) {
      this.reverse -= dt;
      c.throttle = -1;
      c.brake = false;
      c.steer = -clamp(angleDelta(v.heading, headingTo(v.position.x, v.position.z, tx, tz)) * 2, -1, 1);
      return;
    }
    const delta = angleDelta(v.heading, headingTo(v.position.x, v.position.z, tx, tz));
    c.steer = clamp(delta * 2.6, -1, 1);
    const speed = v.forwardSpeed;
    if (Math.abs(delta) > 1.2 && speed > 12) desiredSpeed = Math.min(desiredSpeed, 10);
    c.handbrake = Math.abs(delta) > 1.0 && speed > 14;
    if (speed < desiredSpeed) {
      c.throttle = 1;
      c.brake = false;
    } else {
      c.throttle = 0;
      c.brake = speed > desiredSpeed + 3;
    }
    if (Math.abs(speed) < 0.8 && c.throttle > 0) {
      this.stuck += dt;
      if (this.stuck > 1.6) {
        this.stuck = 0;
        this.reverse = 1.2;
      }
    } else {
      this.stuck = 0;
    }
  }
}

/** A parked roadblock car: just sits with lights flashing. */
class RoadblockDriver {
  constructor(vehicle) {
    this.kind = 'roadblock';
    this.vehicle = vehicle;
  }

  update() {
    const c = this.vehicle.controls;
    c.throttle = 0;
    c.brake = true;
    c.steer = 0;
    this.vehicle.sirenOn = true;
  }
}

export function createPoliceSystem(game) {
  const { events, rng } = game;
  let spawnTimer = 0;
  let roadblockTimer = 8;
  let patrolTimer = 5;
  let helicopter = null;
  const roadblocks = [];

  function pursuitCars() {
    return game.vehicles.filter((v) => v.driver && v.driver.kind === 'police');
  }

  function footCops() {
    return game.peds.filter((p) => p.role === 'cop' && !p.dead);
  }

  /** A road point some distance from the player, preferably behind the camera. */
  function findSpawnPoint(minD, maxD) {
    const focus = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const edges = game.city.network.edges;
    let fallback = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const edge = edges[Math.floor(rng.next() * edges.length)];
      const t = rng.range(15, edge.length - 15);
      const forward = rng.chance(0.5);
      const from = forward ? edge.a : edge.b;
      const to = forward ? edge.b : edge.a;
      const p = lanePoint(from, to, t, 1.9);
      const d = dist2d(p.x, p.z, focus.x, focus.z);
      if (d < minD || d > maxD) continue;
      if (game.vehicles.some((v) => dist2d(v.position.x, v.position.z, p.x, p.z) < 8)) continue;
      const candidate = { x: p.x, z: p.z, heading: Math.atan2(to.x - from.x, to.z - from.z) };
      if (!game.city.collision.lineClear(focus.x, 1.5, focus.z, p.x, 1.5, p.z)) return candidate;
      fallback = candidate;
    }
    return fallback;
  }

  function spawnPursuitCar() {
    const spot = findSpawnPoint(70, 170);
    if (!spot) return null;
    const v = game.vehicleSystem.spawn('interceptor', spot.x, spot.z, spot.heading);
    v.driver = new PursuitDriver(v, game);
    v.persistent = false;
    return v;
  }

  function spawnOfficer(x, z, weapon) {
    const level = game.wanted.level;
    const outfit = level >= 4 ? OUTFITS.swat(rng) : OUTFITS.cop(rng);
    const ped = game.pedSystem.spawnPed('cop', x, z, outfit);
    ped.arm(weapon ?? (level >= 4 ? 'smg' : level >= 3 && rng.chance(0.4) ? 'shotgun' : 'pistol'));
    ped.ai.accuracy = 0.22 + level * 0.06;
    ped.health = level >= 4 ? 120 : 80;
    return ped;
  }

  function deployOfficers(vehicle, driver) {
    driver.deployed = true;
    const f = vehicle.forward();
    for (let i = 0; i < driver.crew; i += 1) {
      const side = i === 0 ? -1 : 1;
      const x = vehicle.position.x + -f.z * side * (vehicle.spec.width / 2 + 0.8);
      const z = vehicle.position.z + f.x * side * (vehicle.spec.width / 2 + 0.8);
      if (footCops().length < MAX_FOOT_COPS[game.wanted.level] + 2) spawnOfficer(x, z);
    }
  }

  /** Two cruisers across a street ahead of the player, officers behind them. */
  function placeRoadblock() {
    const pv = game.player.vehicle;
    if (!pv || pv.speed < 6) return;
    const f = pv.forward();
    const ahead = { x: pv.position.x + f.x * 120, z: pv.position.z + f.z * 120 };
    const road = nearestRoadPoint(game.city.network, ahead.x, ahead.z);
    if (!road || road.distance > 30 || road.edge.bridge) return;
    const e = road.edge;
    const t = Math.min(e.length - 22, Math.max(22, road.t));
    const cx = e.a.x + e.dirX * t;
    const cz = e.a.z + e.dirZ * t;
    if (dist2d(cx, cz, pv.position.x, pv.position.z) < 60) return;
    const across = Math.atan2(-e.dirZ, e.dirX);
    const block = { cars: [], cops: [] };
    for (const side of [-1, 1]) {
      const x = cx - e.dirZ * side * 3.4;
      const z = cz + e.dirX * side * 3.4;
      const v = game.vehicleSystem.spawn('interceptor', x, z, across + (side > 0 ? 0.25 : -0.25));
      v.driver = new RoadblockDriver(v);
      v.missionTag = 'roadblock';
      block.cars.push(v);
      const cop = spawnOfficer(x - e.dirX * 3, z - e.dirZ * 3, 'pistol');
      block.cops.push(cop);
    }
    block.x = cx;
    block.z = cz;
    roadblocks.push(block);
    events.emit('roadblock', { x: cx, z: cz });
  }

  function clearRoadblock(block) {
    for (const v of block.cars) {
      v.missionTag = null;
      if (v.driver && v.driver.kind === 'roadblock') v.driver = null;
    }
  }

  function spawnPatrol() {
    const spot = findSpawnPoint(90, 180);
    if (!spot) return;
    const road = nearestRoadPoint(game.city.network, spot.x, spot.z);
    const e = road.edge;
    const forward = Math.abs(angleDelta(spot.heading, Math.atan2(e.dirX, e.dirZ))) < 1;
    const from = forward ? e.a : e.b;
    const to = forward ? e.b : e.a;
    const v = game.vehicleSystem.spawn('interceptor', spot.x, spot.z, spot.heading);
    v.driver = new LaneDriver(v, from, to, { lane: 1.9, cruise: 11, rng, kind: 'traffic', outfit: OUTFITS.cop(rng) });
  }

  function update(dt) {
    const level = game.wanted.level;
    const focus = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    for (const v of game.vehicles) {
      if (v.driver && (v.driver.kind === 'police' || v.driver.kind === 'roadblock')) {
        if (v.destroyed || v.sunk) {
          v.driver = null;
          v.sirenOn = false;
          continue;
        }
        if (level === 0 && v.driver.kind === 'police') {
          // Stand down: rejoin traffic or drive off.
          const road = nearestRoadPoint(game.city.network, v.position.x, v.position.z);
          v.driver = new LaneDriver(v, road.edge.a, road.edge.b, { lane: 1.9, cruise: 11, rng, outfit: OUTFITS.cop(rng) });
          v.sirenOn = false;
          continue;
        }
        v.driver.update(dt, game);
      }
    }

    spawnTimer -= dt;
    if (level > 0 && spawnTimer <= 0) {
      spawnTimer = 2.5;
      const active = pursuitCars().filter((v) => !v.driver.deployed);
      if (active.length < CARS_BY_LEVEL[level]) spawnPursuitCar();
      // Retire deployed or distant cruisers.
      for (const v of pursuitCars()) {
        if (dist2d(v.position.x, v.position.z, focus.x, focus.z) > 260) game.vehicleSystem.remove(v);
      }
    }
    if (level === 0) {
      patrolTimer -= dt;
      if (patrolTimer <= 0) {
        patrolTimer = 20;
        const patrols = game.vehicles.filter((v) => v.isPolice && v.driver && v.driver.kind === 'traffic').length;
        if (patrols < 2) spawnPatrol();
      }
    }

    // Officers on foot: despawn when far or when the heat is off.
    for (const cop of game.peds.slice()) {
      if (cop.role !== 'cop' || cop.missionTag) continue;
      const d = dist2d(cop.position.x, cop.position.z, focus.x, focus.z);
      if (d > 140 || (level === 0 && d > 60)) game.pedSystem.remove(cop);
    }

    // Roadblocks from three stars.
    roadblockTimer -= dt;
    if (level >= 3 && roadblockTimer <= 0) {
      roadblockTimer = 22;
      if (roadblocks.length < 2) placeRoadblock();
    }
    for (const block of roadblocks.slice()) {
      if (level === 0 || dist2d(block.x, block.z, focus.x, focus.z) > 220) {
        clearRoadblock(block);
        roadblocks.splice(roadblocks.indexOf(block), 1);
      }
    }

    // Helicopter from four stars.
    if (level >= 4 && !helicopter) {
      const angle = rng.range(0, Math.PI * 2);
      helicopter = new Helicopter(game.scene, focus.x + Math.cos(angle) * 200, focus.z + Math.sin(angle) * 200);
      events.emit('helicopter', {});
    }
    if (helicopter) {
      const w = game.wanted.state;
      const lx = w.seen ? focus.x : w.lastSeenX + Math.sin(game.worldTime * 0.7) * w.searchRadius * 0.6;
      const lz = w.seen ? focus.z : w.lastSeenZ + Math.cos(game.worldTime * 0.5) * w.searchRadius * 0.6;
      const cx = level > 0 ? (w.seen ? focus.x : w.lastSeenX) : focus.x + 600;
      const cz = level > 0 ? (w.seen ? focus.z : w.lastSeenZ) : focus.z + 600;
      helicopter.update(dt, cx, cz, lx, lz, game.tod.state.night);
      if (level === 0 && dist2d(helicopter.position.x, helicopter.position.z, focus.x, focus.z) > 400) {
        helicopter.remove();
        helicopter = null;
      }
    }
  }

  /** The helicopter spots the player when its light or crew are near and nothing is in the way. */
  function helicopterSees() {
    if (!helicopter || game.wanted.level < 4) return false;
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const near = dist2d(helicopter.spotX, helicopter.spotZ, p.x, p.z) < 28 || dist2d(helicopter.position.x, helicopter.position.z, p.x, p.z) < 45;
    return near && game.city.collision.lineClear(helicopter.position.x, helicopter.position.y - 1.5, helicopter.position.z, p.x, p.y + 1, p.z);
  }

  function reset() {
    for (const v of game.vehicles.slice()) if (v.isPolice && v.driver && v.driver !== 'player') game.vehicleSystem.remove(v);
    for (const cop of game.peds.slice()) if (cop.role === 'cop' && !cop.missionTag) game.pedSystem.remove(cop);
    for (const block of roadblocks) clearRoadblock(block);
    roadblocks.length = 0;
    if (helicopter) {
      helicopter.remove();
      helicopter = null;
    }
  }

  return {
    update,
    deployOfficers,
    helicopterSees,
    reset,
    spawnPursuitCar,
    spawnOfficer,
    placeRoadblock,
    get helicopter() {
      return helicopter;
    },
    roadblocks,
  };
}
