// An AI racer: drives flat out through a list of checkpoints, braking for corners in proportion
// to how sharp the next turn is, with mild rubber-banding against the player so races stay close.
import { clamp, angleDelta, headingTo, dist2d } from '../core/mathUtils.js';

export class RaceDriver {
  constructor(vehicle, checkpoints, skill = 1) {
    this.kind = 'race';
    this.vehicle = vehicle;
    this.checkpoints = checkpoints;
    this.index = 0;
    this.skill = skill;
    this.finished = false;
    this.finishTime = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.started = false;
    this.offset = (Math.random() - 0.5) * 3;
  }

  /** Progress measure for positions: checkpoints passed plus closeness to the next one. */
  progress() {
    if (this.finished) return 1e6 - this.finishTime;
    const cp = this.checkpoints[this.index];
    return this.index * 1000 - dist2d(this.vehicle.position.x, this.vehicle.position.z, cp[0], cp[1]);
  }

  update(dt, game, playerProgress, time) {
    const v = this.vehicle;
    const c = v.controls;
    if (!this.started || this.finished) {
      c.throttle = 0;
      c.brake = true;
      c.steer = 0;
      return;
    }
    const cp = this.checkpoints[this.index];
    const d = dist2d(v.position.x, v.position.z, cp[0], cp[1]);
    if (d < 11) {
      this.index += 1;
      if (this.index >= this.checkpoints.length) {
        this.finished = true;
        this.finishTime = time;
        return;
      }
    }
    const target = this.checkpoints[this.index];
    const after = this.checkpoints[Math.min(this.index + 1, this.checkpoints.length - 1)];
    // Keep slightly right of the centre line to avoid head-ons.
    const dirX = target[0] - v.position.x;
    const dirZ = target[1] - v.position.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const side = 2 + this.offset * 0.5;
    const want = headingTo(v.position.x, v.position.z, target[0] + (-dirZ / len) * side, target[1] + (dirX / len) * side);
    const delta = angleDelta(v.heading, want);
    c.steer = clamp(delta * 2.8, -1, 1);
    // Corner speed from the angle of the next turn.
    const turnIn = Math.atan2(after[0] - target[0], after[1] - target[1]);
    const sharp = Math.abs(angleDelta(Math.atan2(dirX, dirZ), turnIn));
    let desired = v.spec.maxSpeed * (0.82 + 0.12 * this.skill);
    const dist = Math.hypot(dirX, dirZ);
    if (sharp > 0.6 && dist < 45) desired = Math.min(desired, 14 + (1 - sharp / Math.PI) * 10 + (dist / 45) * 12);
    if (Math.abs(delta) > 0.5) desired = Math.min(desired, 14);
    // Rubber band: ease off when far ahead, push when behind.
    const gap = this.progress() - playerProgress;
    if (gap > 400) desired *= 0.82;
    else if (gap < -500) desired *= 1.08;
    const speed = v.forwardSpeed;
    if (this.reverse > 0) {
      this.reverse -= dt;
      c.throttle = -1;
      c.brake = false;
      c.steer = -c.steer;
      return;
    }
    c.throttle = speed < desired ? 1 : 0;
    c.brake = speed > desired + 2.5;
    c.handbrake = sharp > 1.2 && dist < 18 && speed > 16;
    if (Math.abs(speed) < 1 && c.throttle > 0) {
      this.stuck += dt;
      if (this.stuck > 1.5) {
        this.stuck = 0;
        this.reverse = 1.1;
      }
    } else this.stuck = 0;
  }
}
