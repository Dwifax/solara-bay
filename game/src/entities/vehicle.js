// A drivable car: arcade physics (engine curve, braking, reverse, lateral grip that lets go under
// the handbrake for drifts), collision with buildings using two circles, damage with smoke, fire
// and explosion, sinking in water. Whoever drives it (player or AI) only sets `controls`. The
// physics runs batched in the Rust core (vehicle_physics.rs) when it is loaded; integrate() here
// is the JavaScript fallback, and finishStep() applies the results either way.
import * as THREE from 'three';
import { createVehicleModel, animateVehicleModel } from './vehicleModels.js';
import { clamp, damp } from '../core/mathUtils.js';
import { groundHeight, surfaceHeight, WATER_LEVEL } from '../world/cityLayout.js';

let nextVehicleId = 1;
const IDLE_CONTROLS = Object.freeze({ throttle: 0, steer: 0, brake: true, handbrake: false });
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
    this.impacts = [];
    this.accelF = 0;
    this.groundLevel = 0;
    this.obstacleIndex = -1;
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

  /** The controls the physics obeys this step (a wreck or a sunk car only brakes). */
  activeControls() {
    return this.destroyed || this.sunk ? IDLE_CONTROLS : this.controls;
  }

  /** Step physics, collision and damage. The Rust core batches this in vehicleSystem instead. */
  update(dt, collision, events) {
    this.integrate(dt, collision);
    this.finishStep(dt, events);
  }

  /** JavaScript physics (the fallback for vehicle_physics.rs): engine, grip, yaw, walls, ground. */
  integrate(dt, collision) {
    this.time += dt;
    const spec = this.spec;
    const c = this.activeControls();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -fz;
    const rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const healthFactor = this.healthFactor();

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
    if (c.handbrake && Math.abs(vF) > 5) yaw *= 1.35;
    // Tyres can only turn the car as fast as their grip allows at this speed.
    const maxYaw = ((spec.grip * 2.2) / Math.max(Math.abs(vF), 5)) * (c.handbrake ? 2.2 : 1);
    yaw = clamp(yaw, -maxYaw, maxYaw);
    this.yawRate += (yaw - this.yawRate) * damp(c.handbrake ? 5 : 12, dt);
    this.heading += this.yawRate * dt;

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.forwardSpeed = vF;
    this.lateralSpeed = vR;
    this.accelF = accelF;
    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    // Static collision with both circles.
    this.lastImpact = 0;
    this.impacts.length = 0;
    const circles = this.circles();
    for (let k = 0; k < 2; k += 1) {
      const circle = circles[k];
      const res = collision.resolveCircle(circle.x, circle.z, this.radius, this.position.y);
      if (!res.hit) continue;
      this.position.x += res.x - circle.x;
      this.position.z += res.z - circle.z;
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
        this.impacts.push(impact, circle.x, circle.z);
      }
    }

    // Ground and water.
    const ground = groundHeight(this.position.x, this.position.z);
    this.groundLevel = ground;
    if (ground < WATER_LEVEL - 0.6) {
      this.position.y += (Math.max(ground, WATER_LEVEL - 1.6) - this.position.y) * damp(1.2, dt);
      this.vx *= 1 - damp(1.5, dt);
      this.vz *= 1 - damp(1.5, dt);
    } else {
      this.position.y += (surfaceHeight(this.position.x, this.position.z) - this.position.y) * damp(18, dt);
    }
  }

  healthFactor() {
    return this.health < this.maxHealth * 0.25 ? 0.6 : 1;
  }

  /** Write this car into a row of the vehicle_physics.rs exchange buffer. */
  packRow(io, o) {
    const c = this.activeControls();
    const spec = this.spec;
    io[o] = this.position.x;
    io[o + 1] = this.position.y;
    io[o + 2] = this.position.z;
    io[o + 3] = this.heading;
    io[o + 4] = this.vx;
    io[o + 5] = this.vz;
    io[o + 6] = this.yawRate;
    io[o + 7] = this.steer;
    io[o + 8] = c.throttle;
    io[o + 9] = c.steer;
    io[o + 10] = c.brake ? 1 : 0;
    io[o + 11] = c.handbrake ? 1 : 0;
    io[o + 12] = spec.accel;
    io[o + 13] = spec.brake;
    io[o + 14] = spec.maxSpeed;
    io[o + 15] = spec.grip;
    io[o + 16] = spec.steer;
    io[o + 17] = spec.length;
    io[o + 18] = this.radius;
    io[o + 19] = this.healthFactor();
    io[o + 20] = spec.mass;
  }

  /** Read this car's stepped state back from its row. */
  unpackRow(io, o, dt) {
    this.time += dt;
    this.position.x = io[o];
    this.position.y = io[o + 1];
    this.position.z = io[o + 2];
    this.heading = io[o + 3];
    this.vx = io[o + 4];
    this.vz = io[o + 5];
    this.yawRate = io[o + 6];
    this.steer = io[o + 7];
    this.forwardSpeed = io[o + 22];
    this.lateralSpeed = io[o + 23];
    this.accelF = io[o + 24];
    this.impacts.length = 0;
    if (io[o + 25] > 0) this.impacts.push(io[o + 25], io[o + 26], io[o + 27]);
    if (io[o + 28] > 0) this.impacts.push(io[o + 28], io[o + 29], io[o + 30]);
    this.drifting = io[o + 31] === 1;
    this.groundLevel = io[o + 32];
    this.lastImpact = io[o + 33];
  }

  /** After the physics: crash damage, sinking, the fire countdown, body roll and the model. */
  finishStep(dt, events) {
    const c = this.activeControls();
    const vF = this.forwardSpeed;
    for (let k = 0; k < this.impacts.length; k += 3) {
      const impact = this.impacts[k];
      if (impact > 5) {
        this.damage((impact - 6) * (impact - 6) * 0.45, events, this.driver === 'player' ? 'player-crash' : null);
        events.emit('vehicleImpact', { vehicle: this, impact, x: this.impacts[k + 1], z: this.impacts[k + 2] });
      }
    }
    if (!this.sunk && this.groundLevel < WATER_LEVEL - 0.6 && this.position.y < WATER_LEVEL - 0.3) {
      this.sunk = true;
      events.emit('vehicleSunk', { vehicle: this });
    }

    // Fire countdown once wrecked.
    if (this.fireTimer > 0 && !this.destroyed) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) this.explode(events);
    }

    // Body roll and pitch for feel.
    const targetRoll = clamp(this.yawRate * vF * 0.006, -0.09, 0.09);
    const targetPitch = clamp(-this.accelF * 0.0035, -0.05, 0.05);
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
