// A person in the world other than the player: civilians, police officers, gang members, allies
// and drivers. Holds body state (health, knock-downs from cars, death) and low-level movement;
// what they decide to do lives in the AI systems.
import * as THREE from 'three';
import { createHumanoid, animateHumanoid, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS } from './humanoidModel.js';
import { createWeaponMesh } from './weaponModels.js';
import { angleDelta, damp } from '../core/mathUtils.js';
import { surfaceHeight } from '../world/cityLayout.js';

let nextPedId = 1;

export const OUTFITS = {
  cop: (rng) => ({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), shirt: 0x1f3a68, pants: 0x14213d, cap: 0x14213d, shoes: 0x111111 }),
  swat: (rng) => ({ skin: rng.pick(SKIN_TONES), hair: 0x111111, shirt: 0x22262b, pants: 0x22262b, cap: 0x111418, vest: 0x2f353b, shoes: 0x111111, hairStyle: 'bald' }),
  gang: (rng) => ({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), shirt: rng.pick([0xffffff, 0x1b1b1b]), jacket: rng.pick([0x20b2aa, 0x1b8f86, 0x2ac4b8]), pants: rng.pick([0x2b2b2b, 0x3d3d3d]), cap: rng.chance(0.5) ? 0x13665f : undefined, hairStyle: rng.pick(['short', 'mohawk', 'bald']) }),
  guard: (rng) => ({ skin: rng.pick(SKIN_TONES), hair: 0x111111, shirt: 0x1a1a1a, pants: 0x1a1a1a, vest: 0x2b2b2b, hairStyle: 'bald' }),
  civilian: (rng) => ({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), shirt: rng.pick(SHIRT_COLORS), pants: rng.pick(PANTS_COLORS), hairStyle: rng.pick(['short', 'short', 'long', 'long', 'bun', 'bald', 'mohawk']), jacket: rng.chance(0.18) ? rng.pick([0x2b2b2b, 0x6b4f3a, 0x3e5c76, 0xe9e2d0]) : undefined, cap: rng.chance(0.15) ? rng.pick(SHIRT_COLORS) : undefined, shoes: rng.pick([0x222222, 0xf4f4f4, 0x8b5a2b]) }),
};

export class Pedestrian {
  constructor(role, outfit, x, z, heading = 0) {
    this.id = nextPedId;
    nextPedId += 1;
    this.role = role;
    this.model = createHumanoid(outfit);
    this.group = this.model.group;
    this.position = new THREE.Vector3(x, surfaceHeight(x, z), z);
    this.heading = heading;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.health = role === 'cop' ? 80 : role === 'gang' || role === 'guard' ? 70 : 40;
    this.dead = false;
    this.deadTime = 0;
    this.knockdown = 0;
    this.state = 'walk';
    this.inVehicle = null;
    this.weapon = null;
    this.weaponMesh = null;
    this.fireCooldown = 1 + Math.random();
    this.aim = 0;
    this.punch = 0;
    this.alert = 0;
    this.persistent = false;
    this.missionTag = null;
    this.ai = {};
    this.lastAttacker = null;
    this.syncTransform();
  }

  arm(weaponId) {
    this.weapon = weaponId;
    if (this.weaponMesh) this.model.hand.remove(this.weaponMesh);
    this.weaponMesh = createWeaponMesh(weaponId);
    if (this.weaponMesh) this.model.hand.add(this.weaponMesh);
  }

  /** Walk or run toward (x, z); returns the remaining distance. */
  moveToward(x, z, speed, dt, collision) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      this.speed = 0;
      return d;
    }
    const want = Math.atan2(dx, dz);
    this.heading += angleDelta(this.heading, want) * damp(8, dt);
    const step = Math.min(d, speed * dt);
    this.position.x += (dx / d) * step;
    this.position.z += (dz / d) * step;
    const res = collision.resolveCircle(this.position.x, this.position.z, 0.32, this.position.y);
    this.position.x = res.x;
    this.position.z = res.z;
    this.speed = speed;
    return d;
  }

  faceToward(x, z, dt) {
    const want = Math.atan2(x - this.position.x, z - this.position.z);
    this.heading += angleDelta(this.heading, want) * damp(10, dt);
  }

  takeDamage(amount, attacker, events) {
    if (this.dead) return;
    this.health -= amount;
    this.lastAttacker = attacker;
    this.alert = 1;
    if (this.health <= 0) this.die(attacker, events);
    else if (events) events.emit('pedHurt', { ped: this, attacker });
  }

  die(attacker, events) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.state = 'dead';
    this.deadTime = 0;
    if (this.weaponMesh) this.weaponMesh.visible = false;
    if (events) events.emit('pedKilled', { ped: this, attacker });
  }

  hitByVehicle(vehicle, speed, events) {
    if (this.dead || this.knockdown > 0) return;
    const dx = this.position.x - vehicle.position.x;
    const dz = this.position.z - vehicle.position.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vx = (dx / d) * speed * 0.5 + vehicle.vx * 0.6;
    this.vz = (dz / d) * speed * 0.5 + vehicle.vz * 0.6;
    this.vy = Math.min(7, 2 + speed * 0.25);
    this.knockdown = 2.2;
    const attacker = vehicle.driver === 'player' ? 'player' : null;
    if (events) events.emit('pedHitByVehicle', { ped: this, vehicle, speed, attacker });
    this.takeDamage(speed * 4.5, attacker, events);
  }

  /** Physics for knock-downs and the ground; then animation. */
  updateBody(dt, collision) {
    if (this.inVehicle) return;
    const ground = surfaceHeight(this.position.x, this.position.z);
    if (this.knockdown > 0 || this.vy !== 0 || this.position.y > ground + 0.05) {
      this.knockdown = Math.max(0, this.knockdown - dt);
      this.vy -= 18 * dt;
      this.position.x += this.vx * dt;
      this.position.z += this.vz * dt;
      this.position.y += this.vy * dt;
      const res = collision.resolveCircle(this.position.x, this.position.z, 0.3, this.position.y);
      this.position.x = res.x;
      this.position.z = res.z;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.vy = 0;
        this.vx *= 0.6;
        this.vz *= 0.6;
      }
      this.vx *= 1 - damp(1.5, dt);
      this.vz *= 1 - damp(1.5, dt);
    } else {
      this.position.y = ground;
    }
    if (this.dead) this.deadTime += dt;
    this.punch = Math.max(0, this.punch - dt * 2.6);
    let anim = 'idle';
    if (this.dead || this.knockdown > 0.6) anim = 'dead';
    else if (this.speed > 4) anim = 'run';
    else if (this.speed > 0.3) anim = 'walk';
    animateHumanoid(this.model, dt, anim, this.speed, this.aim, this.punch);
    this.syncTransform();
  }

  syncTransform() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }
}
