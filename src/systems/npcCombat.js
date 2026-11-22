// Behaviour of armed people on foot. Police chase the player and try to arrest at one star or
// shoot from two; gang members and guards defend their ground or attack when hostile; allies
// follow the player and fire at enemies. Shots roll against distance, movement and cover.
import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { dist2d } from '../core/mathUtils.js';

const hand = new THREE.Vector3();

export function createNpcCombat(game) {
  const { events, rng } = game;

  /** Who this armed person wants to fight right now (player, a ped, or null). */
  function pickTarget(ped) {
    const p = game.player;
    if (ped.role === 'cop') {
      if (game.wanted.level > 0 && !p.dead) return p;
      return null;
    }
    if (ped.role === 'gang' || ped.role === 'guard') {
      if ((ped.ai.hostile || ped.alert > 0.5) && !p.dead) {
        const d = dist2d(ped.position.x, ped.position.z, p.position.x, p.position.z);
        if (d < (ped.ai.aggroRange ?? 60)) return p;
      }
      return null;
    }
    if (ped.role === 'ally') {
      let best = null;
      let bestD = 35;
      for (const other of game.peds) {
        if (other.dead || other.inVehicle || !(other.role === 'gang' || other.role === 'guard') || !other.ai.hostile) continue;
        const d = dist2d(ped.position.x, ped.position.z, other.position.x, other.position.z);
        if (d < bestD) {
          bestD = d;
          best = other;
        }
      }
      return best;
    }
    return null;
  }

  function targetPos(target) {
    if (target === game.player && game.player.vehicle) return game.player.vehicle.position;
    return target.position;
  }

  function shoot(ped, target) {
    const def = WEAPONS[ped.weapon] ?? WEAPONS.pistol;
    ped.fireCooldown = def.rate * (def.auto ? rng.range(1, 2.2) : rng.range(2.6, 4.2));
    if (def.auto && rng.chance(0.7)) ped.ai.burst = rng.int(2, 5);
    const tp = targetPos(target);
    const d = dist2d(ped.position.x, ped.position.z, tp.x, tp.z);
    ped.group.updateMatrixWorld(true);
    ped.model.hand.getWorldPosition(hand);
    let accuracy = (ped.ai.accuracy ?? 0.35) * Math.max(0.15, 1 - d / 55);
    if (target === game.player) {
      if (game.player.speed > 5) accuracy *= 0.6;
      if (game.player.vehicle) accuracy *= 0.8;
      accuracy *= game.settings.difficulty;
    }
    const hit = rng.next() < accuracy;
    const ty = target === game.player && game.player.vehicle ? tp.y + 1 : tp.y + 1.2;
    const missX = hit ? 0 : rng.range(-1.6, 1.6);
    const missY = hit ? 0 : rng.range(-0.8, 1.2);
    const missZ = hit ? 0 : rng.range(-1.6, 1.6);
    const ex = tp.x + missX;
    const ey = ty + missY;
    const ez = tp.z + missZ;
    const dx = ex - hand.x;
    const dy = ey - hand.y;
    const dz = ez - hand.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    game.effects.muzzleFlash(hand.x, hand.y, hand.z, dx / len, dy / len, dz / len, def.id === 'shotgun');
    events.emit('gunshot', { x: hand.x, z: hand.z, byPlayer: false, weapon: def.id, shooter: ped });
    if (hit) {
      const damage = def.damage * (def.pellets > 1 ? 3 : 1) * 0.55;
      game.effects.tracer(hand.x, hand.y, hand.z, ex, ey, ez);
      if (target === game.player) {
        if (game.player.vehicle) {
          game.player.vehicle.damage(damage * 0.9, events, null);
          game.effects.impactSparks(ex, ey, ez);
          if (rng.chance(0.25)) game.player.takeDamage(damage * 0.4);
        } else {
          game.effects.blood(ex, ey, ez);
          game.player.takeDamage(damage);
          events.emit('playerShot', { attacker: ped, damage });
        }
      } else {
        target.takeDamage(damage, ped, events);
        game.effects.blood(ex, ey, ez);
      }
    } else {
      const shot = game.combat.castShot(hand.x, hand.y, hand.z, dx / len, dy / len, dz / len, len + 20, ped);
      game.effects.tracer(hand.x, hand.y, hand.z, shot.x, shot.y, shot.z);
      if (shot.type === 'world') game.effects.impactSparks(shot.x, shot.y, shot.z);
      else if (shot.type === 'vehicle') shot.target.damage(def.damage, events, null);
    }
  }

  function updateArmed(ped, dt) {
    if (ped.knockdown > 0) return;
    const collision = game.city.collision;
    ped.alert = Math.max(0, ped.alert - dt * 0.02);
    ped.fireCooldown -= dt;
    const target = pickTarget(ped);
    if (!target) {
      ped.aim = Math.max(0, ped.aim - dt * 3);
      if (ped.role === 'ally') {
        if (ped.ai.post) {
          const d = ped.moveToward(ped.ai.post.x, ped.ai.post.z, 1.4, dt, collision);
          if (d < 0.6) {
            ped.speed = 0;
            const p = game.player.position;
            if (dist2d(p.x, p.z, ped.position.x, ped.position.z) < 12) ped.faceToward(p.x, p.z, dt);
            else if (ped.ai.idleFace) ped.faceToward(ped.ai.idleFace.x, ped.ai.idleFace.z, dt);
          }
        } else followPlayer(ped, dt);
        return;
      }
      if (ped.ai.post) {
        const d = ped.moveToward(ped.ai.post.x, ped.ai.post.z, 1.4, dt, collision);
        if (d < 0.8) ped.speed = 0;
      } else {
        ped.speed = 0;
      }
      return;
    }
    const tp = targetPos(target);
    const d = dist2d(ped.position.x, ped.position.z, tp.x, tp.z);
    const eyeY = ped.position.y + 1.6;
    const seen = d < 70 && collision.lineClear(ped.position.x, eyeY, ped.position.z, tp.x, tp.y + 1.2, tp.z);
    ped.ai.seesTarget = seen;
    const preferred = ped.ai.range ?? (ped.weapon === 'shotgun' ? 10 : 18);

    // Arrest: at one star an unarmed, slow player on foot gets cuffed.
    if (ped.role === 'cop' && target === game.player) {
      const arresting = game.wanted.level <= 1 && !game.player.vehicle && (game.player.current === 'fists' || !game.player.aiming);
      if (arresting) {
        ped.aim = Math.max(0, ped.aim - dt * 3);
        if (d > 1.4) ped.moveToward(tp.x, tp.z, 5.2, dt, collision);
        else {
          ped.speed = 0;
          ped.faceToward(tp.x, tp.z, dt);
          game.wanted.arrestContact(dt);
        }
        return;
      }
    }

    if (!seen || d > preferred + 6) {
      ped.aim = Math.max(0, ped.aim - dt * 3);
      ped.moveToward(tp.x, tp.z, ped.ai.runSpeed ?? 4.8, dt, collision);
      return;
    }
    // In range with a clear line: stand, aim, shoot; strafe a little.
    ped.aim = Math.min(1, ped.aim + dt * 4);
    ped.faceToward(tp.x, tp.z, dt);
    if (d < preferred * 0.5) {
      const ax = ped.position.x - (tp.x - ped.position.x) * 0.2;
      const az = ped.position.z - (tp.z - ped.position.z) * 0.2;
      ped.moveToward(ax, az, 2.2, dt, collision);
      ped.faceToward(tp.x, tp.z, dt * 4);
    } else {
      ped.ai.strafe = (ped.ai.strafe ?? rng.range(-1, 1)) + rng.range(-0.05, 0.05);
      ped.speed = 0;
    }
    if (ped.fireCooldown <= 0 && ped.aim > 0.8) {
      shoot(ped, target);
      if (ped.ai.burst > 0) {
        ped.ai.burst -= 1;
        ped.fireCooldown = (WEAPONS[ped.weapon] ?? WEAPONS.pistol).rate;
      }
    }
  }

  function followPlayer(ped, dt) {
    const p = game.player;
    const d = dist2d(ped.position.x, ped.position.z, p.position.x, p.position.z);
    if (d > 4) ped.moveToward(p.position.x, p.position.z, d > 10 ? 5.5 : 2.4, dt, game.city.collision);
    else ped.speed = 0;
  }

  // Shooting at gang members or guards turns their whole group hostile.
  events.on('pedHurt', ({ ped, attacker }) => {
    if (attacker === 'player' && (ped.role === 'gang' || ped.role === 'guard')) alertGroup(ped);
  });
  events.on('pedKilled', ({ ped, attacker }) => {
    if (attacker === 'player' && (ped.role === 'gang' || ped.role === 'guard')) alertGroup(ped);
  });
  function alertGroup(ped) {
    for (const other of game.peds) {
      if (other.role === ped.role && dist2d(other.position.x, other.position.z, ped.position.x, ped.position.z) < 50) {
        other.ai.hostile = true;
        other.alert = 1;
      }
    }
  }

  return { updateArmed, shoot };
}
