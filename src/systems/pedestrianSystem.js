// Life on the sidewalks: spawns civilians around the player, walks them around block corners and
// across streets, lets beach-goers wander the sand, and makes everyone near gunfire, bodies or
// crashes run away. Armed people (police, gangs) are handed to the combat AI each step.
import { Pedestrian, OUTFITS } from '../entities/pedestrian.js';
import { BLOCK, BEACH, PIER } from '../world/cityLayout.js';
import { dist2d } from '../core/mathUtils.js';

const MAX_CIVILIANS = 36;
const SIDEWALK_INSET = 9.4;
const CORNER_EXITS = [
  // corner index -> [[di, dj, corner on neighbour block], ...]
  [
    [-1, 0, 1],
    [0, -1, 3],
  ],
  [
    [1, 0, 0],
    [0, -1, 2],
  ],
  [
    [1, 0, 3],
    [0, 1, 1],
  ],
  [
    [-1, 0, 2],
    [0, 1, 0],
  ],
];

function cornerOf(bi, bj, k) {
  const x0 = bi * BLOCK;
  const z0 = bj * BLOCK;
  const a = SIDEWALK_INSET;
  const b = BLOCK - SIDEWALK_INSET;
  return [
    { x: x0 + a, z: z0 + a },
    { x: x0 + b, z: z0 + a },
    { x: x0 + b, z: z0 + b },
    { x: x0 + a, z: z0 + b },
  ][k];
}

export function createPedestrianSystem(game) {
  const { events, rng, scene } = game;
  const blockSet = new Set(game.city.blocks.map((b) => `${b.bi},${b.bj}`));
  let spawnTimer = 0;

  function spawnPed(role, x, z, outfit, heading = 0) {
    const ped = new Pedestrian(role, outfit ?? OUTFITS.civilian(rng), x, z, heading);
    scene.add(ped.group);
    game.peds.push(ped);
    return ped;
  }

  function remove(ped) {
    const i = game.peds.indexOf(ped);
    if (i >= 0) game.peds.splice(i, 1);
    scene.remove(ped.group);
  }

  function makeFlee(ped, fromX, fromZ, time = 8) {
    if (ped.dead || ped.role !== 'civilian') return;
    ped.ai.mode = 'flee';
    ped.ai.fleeX = fromX;
    ped.ai.fleeZ = fromZ;
    ped.ai.fleeTime = time;
    if (rng.chance(0.4)) events.emit('scream', { x: ped.position.x, z: ped.position.z });
  }

  function startWalking(ped) {
    const bi = Math.floor(ped.position.x / BLOCK);
    const bj = Math.floor(ped.position.z / BLOCK);
    if (!blockSet.has(`${bi},${bj}`)) {
      ped.ai.mode = 'wander';
      return;
    }
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < 4; k += 1) {
      const c = cornerOf(bi, bj, k);
      const d = dist2d(c.x, c.z, ped.position.x, ped.position.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    ped.ai.mode = 'walk';
    ped.ai.bi = bi;
    ped.ai.bj = bj;
    ped.ai.corner = best;
    ped.ai.dir = rng.chance(0.5) ? 1 : -1;
    ped.ai.walkSpeed = rng.range(1.2, 1.7);
  }

  function nextCorner(ped) {
    const ai = ped.ai;
    if (rng.chance(0.3)) {
      const exits = CORNER_EXITS[ai.corner].filter(([di, dj]) => blockSet.has(`${ai.bi + di},${ai.bj + dj}`));
      if (exits.length) {
        const [di, dj, k] = rng.pick(exits);
        ai.bi += di;
        ai.bj += dj;
        ai.corner = k;
        return;
      }
    }
    ai.corner = (ai.corner + ai.dir + 4) % 4;
  }

  function spawnCivilianNear(focus) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(35, 110);
      const x = focus.x + Math.sin(angle) * dist;
      const z = focus.z + Math.cos(angle) * dist;
      const onBeach = z > BEACH.minZ + 4 && z < BEACH.shoreZ - 8 && x < 340 && !(x > PIER.minX && x < PIER.maxX);
      const bi = Math.floor(x / BLOCK);
      const bj = Math.floor(z / BLOCK);
      if (onBeach) {
        const ped = spawnPed('civilian', x, z, null, rng.range(0, 6.28));
        ped.ai.mode = 'wander';
        ped.ai.walkSpeed = rng.range(0.9, 1.4);
        return ped;
      }
      if (!blockSet.has(`${bi},${bj}`)) continue;
      const k = rng.int(0, 3);
      const a = cornerOf(bi, bj, k);
      const b = cornerOf(bi, bj, (k + 1) % 4);
      const t = rng.next();
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      if (game.city.collision.pointBlocked(px, pz, 0.5)) continue;
      const ped = spawnPed('civilian', px, pz, null);
      ped.ai.mode = 'walk';
      ped.ai.bi = bi;
      ped.ai.bj = bj;
      ped.ai.corner = (k + 1) % 4;
      ped.ai.dir = 1;
      ped.ai.walkSpeed = rng.range(1.2, 1.7);
      return ped;
    }
    return null;
  }

  function updateCivilian(ped, dt) {
    const ai = ped.ai;
    const collision = game.city.collision;
    if (ped.knockdown > 0) return;
    if (ai.mode === 'flee') {
      ai.fleeTime -= dt;
      const dx = ped.position.x - ai.fleeX;
      const dz = ped.position.z - ai.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      ped.moveToward(ped.position.x + (dx / d) * 4, ped.position.z + (dz / d) * 4, 5.6, dt, collision);
      if (ai.fleeTime <= 0) startWalking(ped);
      return;
    }
    if (ai.mode === 'walk') {
      const target = cornerOf(ai.bi, ai.bj, ai.corner);
      const d = ped.moveToward(target.x, target.z, ai.walkSpeed, dt, collision);
      if (d < 0.6) nextCorner(ped);
      return;
    }
    if (ai.mode === 'wander') {
      if (!ai.tx || dist2d(ai.tx, ai.tz, ped.position.x, ped.position.z) < 0.8 || ai.pause > 0) {
        if (ai.pause > 0) {
          ai.pause -= dt;
          ped.speed = 0;
          return;
        }
        ai.tx = ped.position.x + rng.range(-20, 20);
        ai.tz = Math.min(BEACH.shoreZ - 6, Math.max(BEACH.minZ + 3, ped.position.z + rng.range(-12, 12)));
        ai.pause = rng.range(0, 5);
      }
      ped.moveToward(ai.tx, ai.tz, ai.walkSpeed ?? 1.2, dt, collision);
      return;
    }
    if (ai.mode === 'idle') {
      ped.speed = 0;
      return;
    }
    startWalking(ped);
  }

  // Panic: gunfire, killings, explosions and crashes scare nearby civilians.
  function scareAround(x, z, radius, time) {
    for (const ped of game.peds) {
      if (ped.role !== 'civilian' || ped.dead) continue;
      if (dist2d(x, z, ped.position.x, ped.position.z) < radius) makeFlee(ped, x, z, time);
    }
  }
  events.on('gunshot', ({ x, z }) => scareAround(x, z, 45, 10));
  events.on('pedKilled', ({ ped }) => scareAround(ped.position.x, ped.position.z, 25, 9));
  events.on('explosion', ({ x, z }) => scareAround(x, z, 50, 12));
  events.on('pedHurt', ({ ped }) => scareAround(ped.position.x, ped.position.z, 12, 7));
  events.on('vehicleCollision', ({ x, z, impact }) => {
    if (impact > 10) scareAround(x, z, 15, 5);
  });

  function update(dt) {
    const focus = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    for (const ped of game.peds) {
      if (!ped.dead && !ped.inVehicle) {
        if (ped.role === 'civilian') updateCivilian(ped, dt);
        else game.npcCombat.updateArmed(ped, dt);
      }
      ped.updateBody(dt, game.city.collision);
    }
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = 0.3;
      let civilians = 0;
      for (const ped of game.peds) if (ped.role === 'civilian' && !ped.dead) civilians += 1;
      if (civilians < MAX_CIVILIANS * game.settings.pedDensity) spawnCivilianNear(focus);
      for (const ped of game.peds.slice()) {
        if (ped.persistent || ped.missionTag) continue;
        const d = dist2d(ped.position.x, ped.position.z, focus.x, focus.z);
        if (d > 150 || (ped.dead && ped.deadTime > 40 && d > 40)) remove(ped);
      }
    }
  }

  return { update, spawnPed, remove, makeFlee, startWalking, spawnCivilianNear };
}
