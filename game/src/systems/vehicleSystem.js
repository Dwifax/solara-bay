// Steps every car's physics, then resolves car-to-car crashes (mass-weighted push and bounce with
// damage) and cars running into people (knock-downs and injuries).
import { Vehicle } from '../entities/vehicle.js';
import { VEHICLES } from '../data/vehicles.js';
import { wasmCore } from '../core/wasmCore.js';

export function createVehicleSystem(game) {
  const { events, scene } = game;

  function spawn(specId, x, z, heading, color) {
    const spec = VEHICLES[specId];
    const v = new Vehicle(spec, color ?? spec.colors[Math.floor(game.rng.next() * spec.colors.length)], x, z, heading);
    scene.add(v.group);
    game.vehicles.push(v);
    return v;
  }

  function remove(v) {
    const i = game.vehicles.indexOf(v);
    if (i >= 0) game.vehicles.splice(i, 1);
    scene.remove(v.group);
    if (v.driver && v.driver !== 'player' && v.driver.onVehicleRemoved) v.driver.onVehicleRemoved();
  }

  function collideVehicles() {
    const list = game.vehicles;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      const ca = a.circles();
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        const dx0 = b.position.x - a.position.x;
        const dz0 = b.position.z - a.position.z;
        const reach = a.spec.length / 2 + b.spec.length / 2;
        if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
        const cb = b.circles();
        for (const pa of ca) {
          for (const pb of cb) {
            let dx = pb.x - pa.x;
            let dz = pb.z - pa.z;
            const minD = a.radius + b.radius;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            dx /= d;
            dz /= d;
            const overlap = minD - d;
            const ma = a.spec.mass;
            const mb = b.spec.mass;
            const ta = mb / (ma + mb);
            const tb = ma / (ma + mb);
            a.position.x -= dx * overlap * ta;
            a.position.z -= dz * overlap * ta;
            b.position.x += dx * overlap * tb;
            b.position.z += dz * overlap * tb;
            const rel = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;
            if (rel < 0) {
              const impulse = (-(1.25) * rel) / (1 / ma + 1 / mb);
              a.vx -= (impulse / ma) * dx;
              a.vz -= (impulse / ma) * dz;
              b.vx += (impulse / mb) * dx;
              b.vz += (impulse / mb) * dz;
              const impact = -rel;
              if (impact > 3) {
                a.damage(impact * impact * 0.7 * ta, events, a.driver === 'player' ? 'player-crash' : null);
                b.damage(impact * impact * 0.7 * tb, events, b.driver === 'player' ? 'player-crash' : null);
                events.emit('vehicleCollision', { a, b, impact, x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 });
              }
            }
          }
        }
      }
    }
  }

  function collidePeople() {
    for (const v of game.vehicles) {
      const speed = v.speed;
      if (speed < 2.5) continue;
      const circles = v.circles();
      for (const ped of game.peds) {
        if (ped.dead || ped.inVehicle) continue;
        for (const c of circles) {
          const dx = ped.position.x - c.x;
          const dz = ped.position.z - c.z;
          if (dx * dx + dz * dz < (v.radius + 0.45) ** 2) {
            ped.hitByVehicle(v, speed, events);
            break;
          }
        }
      }
      const p = game.player;
      if (!p.vehicle && !p.dead) {
        for (const c of circles) {
          const dx = p.position.x - c.x;
          const dz = p.position.z - c.z;
          if (dx * dx + dz * dz < (v.radius + 0.4) ** 2 && p.invulnerable <= 0) {
            p.takeDamage(speed * 2.2);
            p.invulnerable = 0.8;
            const d = Math.hypot(dx, dz) || 1;
            p.moveX = (dx / d) * speed * 0.6;
            p.moveZ = (dz / d) * speed * 0.6;
            p.vy = 3;
            events.emit('playerHitByCar', { vehicle: v, speed });
            break;
          }
        }
      }
    }
  }

  /** Every car's physics and car-to-car crashes in one pass through vehicle_physics.rs. */
  function stepNative(dt) {
    const list = game.vehicles;
    const n = list.length;
    const stride = wasmCore.VEHICLE_STRIDE;
    let io = wasmCore.vehicleRows(n);
    for (let k = 0; k < n; k += 1) list[k].packRow(io, k * stride);
    wasmCore.stepVehicles(n, dt);
    const crashes = wasmCore.collideVehicles(n);
    io = wasmCore.crashRows(n, crashes);
    for (let k = 0; k < n; k += 1) list[k].unpackRow(io, k * stride, dt);
    // Copy the crash rows out before damage events can call back into the core.
    const base = n * stride;
    const rows = Array.from(io.subarray(base, base + crashes * wasmCore.CRASH_STRIDE));
    for (const v of list) v.finishStep(dt, events);
    for (let c = 0; c < rows.length; c += wasmCore.CRASH_STRIDE) {
      const a = list[rows[c]];
      const b = list[rows[c + 1]];
      const impact = rows[c + 2];
      a.damage(impact * impact * 0.7 * rows[c + 3], events, a.driver === 'player' ? 'player-crash' : null);
      b.damage(impact * impact * 0.7 * rows[c + 4], events, b.driver === 'player' ? 'player-crash' : null);
      events.emit('vehicleCollision', { a, b, impact, x: rows[c + 5], z: rows[c + 6] });
    }
  }

  function update(dt) {
    if (wasmCore.ready) stepNative(dt);
    else {
      for (const v of game.vehicles) v.update(dt, game.city.collision, events);
      collideVehicles();
    }
    collidePeople();
  }

  return { spawn, remove, update };
}
