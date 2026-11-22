// Fighting: the player's fists and guns (hitscan from the crosshair with spread and pellets,
// tracers, muzzle flash, recoil, magazines and reloads, gentle aim assist, drive-by shooting from
// cars), the shared ray test against walls, people and cars, and explosions.
import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { dist2d } from '../core/mathUtils.js';

const tmpVec = new THREE.Vector3();
const camDir = new THREE.Vector3();

/** Ray against a standing person (vertical capsule); returns the distance or Infinity. */
function rayPerson(ox, oy, oz, dx, dy, dz, px, py, pz, height, radius) {
  const h2 = dx * dx + dz * dz;
  if (h2 < 1e-8) return Infinity;
  let t = ((px - ox) * dx + (pz - oz) * dz) / h2;
  if (t < 0) return Infinity;
  const cx = ox + dx * t - px;
  const cz = oz + dz * t - pz;
  const d2 = cx * cx + cz * cz;
  if (d2 > radius * radius) return Infinity;
  t -= Math.sqrt(radius * radius - d2) / Math.sqrt(h2);
  const y = oy + dy * t;
  if (y < py || y > py + height) return Infinity;
  return t;
}

/** Ray against a car's oriented box; returns the distance or Infinity. */
function rayVehicle(ox, oy, oz, dx, dy, dz, v) {
  const c = Math.cos(v.heading);
  const s = Math.sin(v.heading);
  const rx = ox - v.position.x;
  const rz = oz - v.position.z;
  // Into the car frame: local x = right-ish, local z = forward.
  const lx = rx * c - rz * s;
  const lz = rx * s + rz * c;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const ly = oy - v.position.y;
  const hw = v.spec.width / 2;
  const hl = v.spec.length / 2;
  let tmin = 0;
  let tmax = Infinity;
  for (const [o, d, lo, hi] of [
    [lx, ldx, -hw, hw],
    [ly, dy, 0.2, v.model.roofY ?? 1.5],
    [lz, ldz, -hl, hl],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function createCombatSystem(game) {
  const { events, input } = game;

  /** First thing hit along a ray: world, a person, the player or a car. */
  function castShot(ox, oy, oz, dx, dy, dz, range, shooter) {
    let best = { t: range, type: 'none', target: null };
    const wall = game.city.collision.raycast(ox, oy, oz, dx, dy, dz, range);
    if (wall < best.t) best = { t: wall, type: 'world', target: null };
    for (const ped of game.peds) {
      if (ped.dead || ped.inVehicle || ped === shooter) continue;
      const t = rayPerson(ox, oy, oz, dx, dy, dz, ped.position.x, ped.position.y, ped.position.z, 1.95, 0.32);
      if (t < best.t) best = { t, type: 'ped', target: ped };
    }
    const p = game.player;
    if (shooter !== 'player' && !p.dead) {
      if (!p.vehicle) {
        const t = rayPerson(ox, oy, oz, dx, dy, dz, p.position.x, p.position.y, p.position.z, 1.9, 0.34);
        if (t < best.t) best = { t, type: 'player', target: p };
      }
    }
    for (const v of game.vehicles) {
      if (shooter === 'player' && v === p.vehicle) continue;
      if (shooter && shooter.inVehicle === v) continue;
      if (dist2d(ox, oz, v.position.x, v.position.z) > range + 5) continue;
      const t = rayVehicle(ox, oy, oz, dx, dy, dz, v);
      if (t < best.t) best = { t, type: 'vehicle', target: v };
    }
    best.x = ox + dx * best.t;
    best.y = oy + dy * best.t;
    best.z = oz + dz * best.t;
    return best;
  }

  /** Apply a bullet's effect at what it hit. */
  function applyHit(hit, damage, attacker, dirX, dirZ) {
    const fx = game.effects;
    if (hit.type === 'world') fx.impactSparks(hit.x, hit.y, hit.z, -dirX, 0.3, -dirZ);
    else if (hit.type === 'ped') {
      const ped = hit.target;
      const head = hit.y > ped.position.y + 1.58;
      fx.blood(hit.x, hit.y, hit.z);
      ped.takeDamage(damage * (head ? 2.5 : 1), attacker, events);
      if (ped.dead) {
        ped.vx = dirX * 2;
        ped.vz = dirZ * 2;
      }
      events.emit('bulletHitPed', { ped, attacker, head });
    } else if (hit.type === 'player') {
      fx.blood(hit.x, hit.y, hit.z);
      game.player.takeDamage(damage);
      events.emit('playerShot', { attacker, damage });
    } else if (hit.type === 'vehicle') {
      const v = hit.target;
      fx.impactSparks(hit.x, hit.y, hit.z, -dirX, 0.4, -dirZ);
      v.damage(damage * 1.6, events, attacker === 'player' ? 'player-shot' : null);
      if (v.driver && v.driver !== 'player' && v.driver.kind === 'traffic' && attacker === 'player' && game.rng.chance(0.25)) {
        // Shot at, a driver bails out and runs.
        const driver = v.driver;
        v.driver = null;
        v.controls.brake = true;
        game.traffic.ejectDriver(v, driver, game.player.position);
      }
      if (v.driver === 'player' && attacker !== 'player' && game.rng.chance(0.18)) game.player.takeDamage(damage * 0.35);
    }
  }

  /** The aim direction from the crosshair, nudged toward a nearby enemy when aiming. */
  function aimDirection() {
    game.camera.getWorldDirection(camDir);
    if (!game.player.aiming) return camDir;
    let best = null;
    let bestDot = Math.cos(0.07);
    const cam = game.camera.position;
    for (const ped of game.peds) {
      if (ped.dead || ped.inVehicle || ped.role === 'civilian' || ped.role === 'ally') continue;
      tmpVec.set(ped.position.x - cam.x, ped.position.y + 1.25 - cam.y, ped.position.z - cam.z);
      const len = tmpVec.length();
      if (len > 80) continue;
      tmpVec.divideScalar(len);
      const dot = tmpVec.dot(camDir);
      if (dot > bestDot) {
        bestDot = dot;
        best = tmpVec.clone();
      }
    }
    return best ?? camDir;
  }

  function muzzlePosition(out) {
    const player = game.player;
    if (player.vehicle) {
      const v = player.vehicle;
      return out.set(v.position.x, v.position.y + (v.model.roofY ?? 1.5) + 0.2, v.position.z);
    }
    player.group.updateMatrixWorld(true);
    player.model.hand.getWorldPosition(out);
    return out;
  }

  function firePlayerWeapon() {
    const player = game.player;
    const def = WEAPONS[player.current];
    const ammo = player.weapons[player.current];
    if (ammo.mag <= 0) {
      if (ammo.reserve > 0) startReload();
      else events.emit('dryFire', {});
      player.fireCooldown = 0.3;
      return;
    }
    ammo.mag -= 1;
    player.fireCooldown = def.rate;
    const dir = aimDirection();
    const cam = game.camera.position;
    const muzzle = muzzlePosition(new THREE.Vector3());
    // Start the aim ray level with the player so nothing behind them is hit.
    const skip = Math.max(0, (muzzle.x - cam.x) * dir.x + (muzzle.y - cam.y) * dir.y + (muzzle.z - cam.z) * dir.z);
    const ox = cam.x + dir.x * skip;
    const oy = cam.y + dir.y * skip;
    const oz = cam.z + dir.z * skip;
    const spread = def.spread * (player.aiming ? 0.55 : 1.2) * (player.speed > 4 ? 1.6 : 1);
    for (let i = 0; i < def.pellets; i += 1) {
      const dx = dir.x + (Math.random() - 0.5) * spread * 2;
      const dy = dir.y + (Math.random() - 0.5) * spread * 2;
      const dz = dir.z + (Math.random() - 0.5) * spread * 2;
      const len = Math.hypot(dx, dy, dz);
      const hit = castShot(ox, oy, oz, dx / len, dy / len, dz / len, def.range, 'player');
      game.effects.tracer(muzzle.x, muzzle.y, muzzle.z, hit.x, hit.y, hit.z);
      if (hit.type !== 'none') applyHit(hit, def.damage, 'player', dx / len, dz / len);
    }
    game.effects.muzzleFlash(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, def.id === 'shotgun');
    game.cameraCtl.state.pitch += def.recoil;
    game.cameraCtl.shake(def.id === 'shotgun' ? 0.25 : 0.05);
    events.emit('gunshot', { x: muzzle.x, z: muzzle.z, byPlayer: true, weapon: def.id });
    game.stats.shotsFired += 1;
    if (ammo.mag === 0 && ammo.reserve > 0) startReload();
  }

  function startReload() {
    const player = game.player;
    const def = WEAPONS[player.current];
    const ammo = player.weapons[player.current];
    if (!def.clip || player.reloadTimer > 0 || ammo.mag >= def.clip || ammo.reserve <= 0) return;
    player.reloadTimer = def.id === 'shotgun' ? 1.9 : 1.3;
    events.emit('reload', { weapon: def.id });
  }

  function finishReload() {
    const player = game.player;
    const def = WEAPONS[player.current];
    const ammo = player.weapons[player.current];
    const need = def.clip - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }

  function punch() {
    const player = game.player;
    player.punch = 1;
    player.fireCooldown = WEAPONS.fists.rate;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let target = null;
    let bestD = WEAPONS.fists.range;
    for (const ped of game.peds) {
      if (ped.dead || ped.inVehicle) continue;
      const dx = ped.position.x - player.position.x;
      const dz = ped.position.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.4) {
        bestD = d;
        target = ped;
      }
    }
    events.emit('punch', { hit: !!target });
    if (target) {
      target.takeDamage(WEAPONS.fists.damage, 'player', events);
      target.vx = fx * 3;
      target.vz = fz * 3;
      target.vy = 1.5;
      target.knockdown = target.dead ? 2 : 0.7;
      game.effects.blood(target.position.x, target.position.y + 1.5, target.position.z);
      events.emit('meleeHit', { ped: target });
    }
  }

  events.on('explosion', ({ x, y, z, radius, source }) => {
    game.effects.explosion(x, y, z);
    const p = game.player;
    const camD = dist2d(x, z, game.camera.position.x, game.camera.position.z);
    game.cameraCtl.shake(Math.max(0, 1.2 - camD / 60));
    for (const ped of game.peds) {
      const d = dist2d(x, z, ped.position.x, ped.position.z);
      if (d < radius && !ped.inVehicle) {
        ped.vx = ((ped.position.x - x) / (d || 1)) * 8;
        ped.vz = ((ped.position.z - z) / (d || 1)) * 8;
        ped.vy = 6;
        ped.knockdown = 2;
        ped.takeDamage(120 * (1 - d / radius) + 20, source && source.lastDamagedByPlayer ? 'player' : null, events);
      }
    }
    for (const v of game.vehicles) {
      if (v === source) continue;
      const d = dist2d(x, z, v.position.x, v.position.z);
      if (d < radius) v.damage(900 * (1 - d / radius), events, null);
    }
    const dp = dist2d(x, z, p.position.x, p.position.z);
    if (dp < radius) {
      if (p.vehicle === source) p.takeDamage(200);
      else p.takeDamage(90 * (1 - dp / radius));
    }
  });

  function update(dt) {
    const player = game.player;
    if (player.dead) return;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        player.reloadTimer = 0;
        finishReload();
      }
      return;
    }
    if (input.wasPressed('KeyR')) startReload();
    const def = WEAPONS[player.current];
    if (player.vehicle) {
      // Drive-by: pistol and SMG only, while holding the right mouse button.
      if (!(player.current === 'pistol' || player.current === 'smg') || !input.mouseDown(2)) return;
      const trigger = def.auto ? input.mouseDown(0) : input.mouseClicked(0);
      if (trigger && player.fireCooldown <= 0) firePlayerWeapon();
      return;
    }
    if (def.melee) {
      if (input.mouseClicked(0) && player.fireCooldown <= 0) punch();
      return;
    }
    const trigger = def.auto ? input.mouseDown(0) : input.mouseClicked(0);
    if (trigger && player.fireCooldown <= 0) firePlayerWeapon();
  }

  return { update, castShot, applyHit, startReload, punch, firePlayerWeapon };
}
