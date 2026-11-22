// A hostile driver that hunts the player: steers straight for them (leading a moving car) to
// ram, backs off and charges again, and reverses out when stuck on a wall.
import { clamp, angleDelta, headingTo, dist2d } from '../core/mathUtils.js';

export class HunterDriver {
  constructor(vehicle, game) {
    this.kind = 'hunter';
    this.vehicle = vehicle;
    this.game = game;
    this.stuck = 0;
    this.reverse = 0;
  }

  update(dt) {
    const v = this.vehicle;
    const c = v.controls;
    const game = this.game;
    const pv = game.player.vehicle;
    const target = pv ? pv.position : game.player.position;
    const lead = pv ? 0.8 : 0;
    const tx = target.x + (pv ? pv.vx * lead : 0);
    const tz = target.z + (pv ? pv.vz * lead : 0);
    const d = dist2d(v.position.x, v.position.z, tx, tz);
    if (this.reverse > 0) {
      this.reverse -= dt;
      c.throttle = -1;
      c.brake = false;
      c.steer = -clamp(angleDelta(v.heading, headingTo(v.position.x, v.position.z, tx, tz)) * 2, -1, 1);
      return;
    }
    const delta = angleDelta(v.heading, headingTo(v.position.x, v.position.z, tx, tz));
    c.steer = clamp(delta * 2.5, -1, 1);
    const desired = d < 12 ? (pv ? pv.speed + 6 : 6) : 30;
    c.throttle = v.forwardSpeed < desired ? 1 : 0;
    c.brake = v.forwardSpeed > desired + 4;
    c.handbrake = Math.abs(delta) > 1.1 && v.forwardSpeed > 12;
    if (Math.abs(v.forwardSpeed) < 0.8 && c.throttle > 0) {
      this.stuck += dt;
      if (this.stuck > 1.4) {
        this.stuck = 0;
        this.reverse = 1.1;
      }
    } else this.stuck = 0;
  }
}
