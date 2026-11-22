// A drivable car: arcade physics (engine curve, braking, reverse, lateral grip that lets go under
// the handbrake for drifts), collision with buildings using two circles, damage with smoke, fire
// and explosion, sinking in water. Whoever drives it (player or AI) only sets `controls`.
import * as THREE from 'three';
import { createVehicleModel, animateVehicleModel } from './vehicleModels.js';
import { clamp, damp } from '../core/mathUtils.js';
import { groundHeight, surfaceHeight, WATER_LEVEL } from '../world/cityLayout.js';

let nextVehicleId = 1;
const charredMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 1 });

export class Vehicle {
  constructor(spec, color, x, z, heading) {
    this.id = nextVehicleId;
    nextVehicleId += 1;
    this.spec = spec;
    this.color = color;
    this.model = createVehicleModel(spec, color);
    this.group = this.model.group;
    this.position = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.health = spec.health;
    this.maxHealth = spec.health;
    this.fireTimer = 0;
    this.destroyed = false;
    this.sunk = false;
    this.driver = null; // 'player' | npc object | null
    this.passenger = null;
    this.isPolice = spec.id === 'interceptor';
    this.sirenOn = false;
    this.controls = { throttle: 0, steer: 0, brake: false, handbrake: false };
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.lastImpact = 0;
    this.drifting = false;
    this.roll = 0;
    this.pitch = 0;
    this.time = Math.random() * 10;
    this.persistent = false;
    this.headlights = false;
    this.missionTag = null;
    this.radius = spec.width / 2 + 0.15;
    this.syncTransform();
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get speedKmh() {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** The two collision circle centres (front and rear axle areas). */
  circles() {
    const f = this.forward();
    const off = this.spec.length / 2 - this.radius;
    return [
      { x: this.position.x + f.x * off, z: this.position.z + f.z * off },
      { x: this.position.x - f.x * off, z: this.position.z - f.z * off },
    ];
  }

  /** Where someone stands to get into the driver's (left) door. */
  doorPosition() {
    const f = this.forward();
    const rx = -f.z;
    const rz = f.x;
    // Driver sits on the left: opposite of the right vector.
    return { x: this.position.x - rx * (this.spec.width / 2 + 0.7) + f.x * 0.3, z: this.position.z - rz * (this.spec.width / 2 + 0.7) + f.z * 0.3 };
  }

  damage(amount, events, cause) {
    if (this.destroyed) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      if (this.fireTimer <= 0) this.fireTimer = 4.5;
    }
    if (events && cause) events.emit('vehicleDamaged', { vehicle: this, amount, cause });
  }

  explode(events) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.vx *= 0.3;
    this.vz *= 0.3;
    this.model.chassis.children[0].material = charredMaterial;
    this.model.beams.visible = false;
    events.emit('explosion', { x: this.position.x, y: this.position.y + 1, z: this.position.z, radius: 9, source: this });
  }

  /** Step the physics. collision: the static world. */
  update(dt, collision, events) {
    this.time += dt;
    const spec = this.spec;
    const c = this.destroyed || this.sunk ? { throttle: 0, steer: 0, brake: true, handbrake: false } : this.controls;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const healthFactor = this.health < this.maxHealth * 0.25 ? 0.6 : 1;

    // Engine, brakes and drag along the car.
    let accelF = 0;
    if (c.throttle > 0.05) {
      if (vF < -0.5) accelF = spec.brake * c.throttle;
      else accelF = spec.accel * c.throttle * healthFactor * (1 - clamp(vF / spec.maxSpeed, 0, 1) ** 2);
    } else if (c.throttle < -0.05) {
      if (vF > 0.5) accelF = -spec.brake * -c.throttle;
      else accelF = vF > -spec.maxSpeed * 0.3 ? -spec.accel * 0.6 * -c.throttle : 0;
    }
    vF += accelF * dt;
    if (c.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), spec.brake * dt);
    if (Math.abs(c.throttle) < 0.05) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 2.2 * dt);
    vF -= vF * Math.abs(vF) * 0.0009 * dt;
    if (c.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), spec.brake * 0.35 * dt);

    // Lateral grip: the handbrake lets the rear step out.
    const grip = c.handbrake ? spec.grip * 0.18 : spec.grip * (Math.abs(vR) > 6 ? 0.55 : 1);
    vR *= 1 - damp(grip, dt);
    this.drifting = Math.abs(vR) > 3.2 && Math.abs(vF) > 8;

    // Steering: less lock at speed; yaw from a bicycle model.
    const speedRatio = clamp(Math.abs(vF) / spec.maxSpeed, 0, 1);
    const targetSteer = c.steer * spec.steer * (1 - 0.6 * speedRatio);
    this.steer += (targetSteer - this.steer) * damp(10, dt);
    const wheelbase = spec.length * 0.6;
    let yaw = (vF / wheelbase) * Math.tan(this.steer);
    if (c.handbrake && Math.abs(vF) > 5) yaw *= 1.45;
    this.yawRate += (yaw - this.yawRate) * damp(c.handbrake ? 5 : 12, dt);
    this.heading += this.yawRate * dt;

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.forwardSpeed = vF;
    this.lateralSpeed = vR;
    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    // Static collision with both circles.
    this.lastImpact = 0;
    const circles = this.circles();
    for (let k = 0; k < 2; k += 1) {
      const circle = circles[k];
      const res = collision.resolveCircle(circle.x, circle.z, this.radius, this.position.y);
      if (!res.hit) continue;
      const pushX = res.x - circle.x;
      const pushZ = res.z - circle.z;
      this.position.x += pushX;
      this.position.z += pushZ;
      const vn = this.vx * res.nx + this.vz * res.nz;
      if (vn < 0) {
        this.vx -= res.nx * vn * 1.3;
        this.vz -= res.nz * vn * 1.3;
        this.vx *= 0.85;
        this.vz *= 0.85;
        const impact = -vn;
        this.lastImpact = Math.max(this.lastImpact, impact);
        // A glancing hit at the front turns the car away from the wall.
        this.yawRate += (k === 0 ? 1 : -1) * (res.nx * fz - res.nz * fx) * impact * 0.05;
        if (impact > 5) {
          this.damage((impact - 4) * (impact - 4) * 1.6, events, this.driver === 'player' ? 'player-crash' : null);
          events.emit('vehicleImpact', { vehicle: this, impact, x: circle.x, z: circle.z });
        }
      }
    }

    // Ground and water.
    const ground = groundHeight(this.position.x, this.position.z);
    if (ground < WATER_LEVEL - 0.6) {
      this.position.y += (Math.max(ground, WATER_LEVEL - 1.6) - this.position.y) * damp(1.2, dt);
      this.vx *= 1 - damp(1.5, dt);
      this.vz *= 1 - damp(1.5, dt);
      if (!this.sunk && this.position.y < WATER_LEVEL - 0.3) {
        this.sunk = true;
        events.emit('vehicleSunk', { vehicle: this });
      }
    } else {
      this.position.y += (surfaceHeight(this.position.x, this.position.z) - this.position.y) * damp(18, dt);
    }

    // Fire countdown once wrecked.
    if (this.fireTimer > 0 && !this.destroyed) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) this.explode(events);
    }

    // Body roll and pitch for feel.
    const targetRoll = clamp(this.yawRate * vF * 0.006, -0.09, 0.09);
    const targetPitch = clamp(-accelF * 0.0035, -0.05, 0.05);
    this.roll += (targetRoll - this.roll) * damp(6, dt);
    this.pitch += (targetPitch - this.pitch) * damp(6, dt);
    this.syncTransform();
    animateVehicleModel(this.model, dt, {
      speed: vF,
      steer: this.steer,
      braking: (c.brake || (c.throttle < -0.05 && vF > 0.5)) && !this.destroyed,
      sirenOn: this.sirenOn && !this.destroyed,
      time: this.time,
      roll: this.roll,
      pitch: this.pitch,
      headlights: this.headlights && !this.destroyed && !this.sunk,
    });
  }

  syncTransform() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }
}
