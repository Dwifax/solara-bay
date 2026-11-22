// Sol Navarro, the player character: on-foot movement relative to the camera (jog, sprint with
// stamina, jump, swim), health and armour, and the weapon inventory with magazines and reserve.
import * as THREE from 'three';
import { createHumanoid, animateHumanoid } from './humanoidModel.js';
import { createWeaponMesh } from './weaponModels.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp, damp, angleDelta } from '../core/mathUtils.js';
import { groundHeight, surfaceHeight, WATER_LEVEL } from '../world/cityLayout.js';

const JOG = 5.4;
const SPRINT = 8.6;
const GRAVITY = 18;
const RADIUS = 0.35;

export const PLAYER_OUTFIT = { skin: 0xc68a5e, hair: 0x1c1410, shirt: 0xe9576b, pants: 0x2b3a55, shoes: 0xf4f4f4, hairStyle: 'long' };

export class Player {
  constructor(x, z) {
    this.model = createHumanoid(PLAYER_OUTFIT);
    this.group = this.model.group;
    this.position = new THREE.Vector3(x, 0, z);
    this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.moveX = 0;
    this.moveZ = 0;
    this.onGround = true;
    this.swimming = false;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.stamina = 1;
    this.vehicle = null;
    this.dead = false;
    this.aim = 0;
    this.aiming = false;
    this.punch = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.invulnerable = 0;
    this.weapons = { fists: { mag: 0, reserve: 0 } };
    this.current = 'fists';
    this.weaponMesh = null;
    this.animState = 'idle';
  }

  get radius() {
    return RADIUS;
  }

  hasWeapon(id) {
    return !!this.weapons[id];
  }

  giveWeapon(id, ammo) {
    const def = WEAPONS[id];
    if (!this.weapons[id]) this.weapons[id] = { mag: 0, reserve: 0 };
    const w = this.weapons[id];
    w.reserve += ammo;
    if (w.mag === 0 && def.clip) {
      const load = Math.min(def.clip, w.reserve);
      w.mag = load;
      w.reserve -= load;
    }
  }

  selectWeapon(id) {
    if (!this.weapons[id]) return false;
    this.current = id;
    this.reloadTimer = 0;
    if (this.weaponMesh) this.model.hand.remove(this.weaponMesh);
    this.weaponMesh = createWeaponMesh(id);
    if (this.weaponMesh) this.model.hand.add(this.weaponMesh);
    return true;
  }

  takeDamage(amount) {
    if (this.dead || this.invulnerable > 0) return 0;
    let rest = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, rest * 0.7);
      this.armor -= absorbed;
      rest -= absorbed;
    }
    this.health = Math.max(0, this.health - rest);
    if (this.health <= 0) this.dead = true;
    return rest;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Move on foot. move: {x, z} desired direction in world space (length 0..1), sprint, jump, faceYaw
   * when aiming. Returns true on a footstep.
   */
  updateOnFoot(dt, move, sprint, jump, faceYaw, collision) {
    if (this.dead) {
      animateHumanoid(this.model, dt, 'dead', 0);
      return false;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const len = Math.min(1, Math.hypot(move.x, move.z));
    const wantSprint = sprint && len > 0.1 && this.stamina > 0.05 && !this.aiming;
    const top = this.swimming ? 2.4 : this.aiming ? 3.2 : wantSprint ? SPRINT : JOG;
    this.stamina = clamp(this.stamina + (wantSprint ? -0.12 : 0.18) * dt, 0, 1);
    const targetX = len > 0.01 ? (move.x / Math.max(len, 1e-6)) * top * len : 0;
    const targetZ = len > 0.01 ? (move.z / Math.max(len, 1e-6)) * top * len : 0;
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.moveX += (targetX - this.moveX) * damp(accel, dt);
    this.moveZ += (targetZ - this.moveZ) * damp(accel, dt);
    this.speed = Math.hypot(this.moveX, this.moveZ);

    if (this.aiming) {
      this.heading += angleDelta(this.heading, faceYaw) * damp(20, dt);
    } else if (this.speed > 0.3) {
      const want = Math.atan2(this.moveX, this.moveZ);
      this.heading += angleDelta(this.heading, want) * damp(12, dt);
    }

    this.position.x += this.moveX * dt;
    this.position.z += this.moveZ * dt;
    const res = collision.resolveCircle(this.position.x, this.position.z, RADIUS, this.position.y);
    this.position.x = res.x;
    this.position.z = res.z;

    const ground = groundHeight(this.position.x, this.position.z);
    const swimLevel = WATER_LEVEL - 1.05;
    this.swimming = ground < WATER_LEVEL - 1.1;
    const floor = this.swimming ? swimLevel : surfaceHeight(this.position.x, this.position.z);
    if (jump && this.onGround && !this.swimming) {
      this.vy = 6.2;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    this.position.y += this.vy * dt;
    if (this.position.y <= floor) {
      if (!this.onGround && this.vy < -14) this.takeDamage((-this.vy - 14) * 6);
      this.position.y = this.swimming ? this.position.y + (floor - this.position.y) * damp(6, dt) : floor;
      this.vy = 0;
      this.onGround = true;
    } else if (this.position.y > floor + 0.25) {
      this.onGround = false;
    } else if (this.vy <= 0) {
      this.position.y = floor;
      this.vy = 0;
      this.onGround = true;
    }

    this.aim += ((this.aiming ? 1 : 0) - this.aim) * damp(14, dt);
    this.punch = Math.max(0, this.punch - dt * 2.6);
    const state = this.swimming ? 'swim' : this.speed > 6.5 ? 'run' : this.speed > 0.4 ? 'walk' : 'idle';
    const before = Math.sin(this.model.phase);
    animateHumanoid(this.model, dt, state, this.speed, this.aim, this.punch);
    const after = Math.sin(this.model.phase);
    this.animState = state;
    this.syncTransform();
    return (state === 'walk' || state === 'run') && this.onGround && Math.sign(before) !== Math.sign(after);
  }

  syncTransform() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }
}
