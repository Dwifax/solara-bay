// An AI driver that follows right-hand lanes along the street graph: it looks ahead along its
// lane, picks a turn at each junction (or follows a given route), slows for corners, stops at red
// lights and behind anything in its path, and backs out when stuck.
import { clamp, angleDelta, headingTo } from '../core/mathUtils.js';
import { lanePoint, direction, chooseNextNode, signalStates, STOP_DISTANCE } from './roadNavigation.js';
import { ROAD_HALF } from '../world/cityLayout.js';

export class LaneDriver {
  constructor(vehicle, from, to, opts = {}) {
    this.kind = opts.kind ?? 'traffic';
    this.vehicle = vehicle;
    this.prev = null;
    this.from = from;
    this.to = to;
    this.route = opts.route ? opts.route.slice() : null;
    this.lane = opts.lane ?? 3.5;
    this.cruise = opts.cruise ?? 12;
    this.obeySignals = opts.obeySignals ?? true;
    this.rng = opts.rng;
    this.next = this.pickNext();
    this.stuck = 0;
    this.reverse = 0;
    this.panic = 0;
    this.honkTimer = 0;
    this.blockedBy = null;
    this.waitTime = 0;
    this.outfit = opts.outfit ?? null;
    this.finished = false;
  }

  pickNext() {
    if (this.route) {
      if (this.route.length > 0) return this.route[0];
      return null;
    }
    return chooseNextNode(this.to, this.from, this.rng);
  }

  advance() {
    this.prev = this.from;
    this.from = this.to;
    if (this.route) this.route.shift();
    if (!this.next) {
      this.finished = true;
      return;
    }
    this.to = this.next;
    this.next = this.pickNext();
  }

  /** Distance to the nearest thing in our path ahead (cars, people, the player), or Infinity. */
  scanAhead(game, range) {
    const v = this.vehicle;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    let nearest = Infinity;
    this.blockedBy = null;
    const check = (x, z, halfWidth, who) => {
      const dx = x - v.position.x;
      const dz = z - v.position.z;
      const f = dx * fx + dz * fz;
      if (f <= 0 || f > range) return;
      const l = Math.abs(-dx * fz + dz * fx);
      if (l < halfWidth + v.spec.width / 2 + 0.3 && f < nearest) {
        nearest = f;
        this.blockedBy = who;
      }
    };
    for (const other of game.vehicles) {
      if (other === v) continue;
      const dx = other.position.x - v.position.x;
      const dz = other.position.z - v.position.z;
      if (dx * dx + dz * dz > range * range) continue;
      check(other.position.x, other.position.z, other.spec.width / 2, other.driver === 'player' ? 'player' : 'car');
    }
    for (const ped of game.peds) {
      if (ped.dead || ped.inVehicle) continue;
      const dx = ped.position.x - v.position.x;
      const dz = ped.position.z - v.position.z;
      if (dx * dx + dz * dz > range * range) continue;
      check(ped.position.x, ped.position.z, 0.4, 'ped');
    }
    const p = game.player;
    if (!p.vehicle && !p.dead) check(p.position.x, p.position.z, 0.4, 'player');
    return nearest - v.spec.length / 2;
  }

  update(dt, game) {
    const v = this.vehicle;
    const c = v.controls;
    if (this.finished || !this.to) {
      c.throttle = 0;
      c.brake = true;
      c.steer = 0;
      return;
    }
    const d = direction(this.from, this.to);
    const t = (v.position.x - this.from.x) * d.x + (v.position.z - this.from.z) * d.z;
    const remaining = d.len - t;
    if (remaining < ROAD_HALF * 0.6) {
      this.advance();
      if (this.finished) return;
      return;
    }
    const speed = v.forwardSpeed;
    const look = 6 + Math.abs(speed) * 0.55;
    let target;
    if (remaining > look || !this.next) target = lanePoint(this.from, this.to, Math.min(d.len, t + look), this.lane);
    else target = lanePoint(this.to, this.next, look - remaining + ROAD_HALF * 0.7, this.lane);

    let desired = this.panic > 0 ? this.cruise * 1.7 : this.cruise;
    if (this.next) {
      const dn = direction(this.to, this.next);
      const turning = d.x * dn.x + d.z * dn.z < 0.7;
      if (turning && remaining < 28) desired = Math.min(desired, this.panic > 0 ? 11 : 7);
    }
    // Traffic signals at junctions with three or more streets.
    if (this.obeySignals && this.panic <= 0 && this.to.neighbors.length >= 3) {
      const states = signalStates(game.worldTime);
      const state = Math.abs(d.z) > 0.5 ? states.ns : states.ew;
      const toStop = remaining - STOP_DISTANCE;
      if (toStop > -1 && toStop < 30 && (state === 'red' || (state === 'yellow' && toStop > 6))) {
        desired = Math.min(desired, Math.max(0, toStop * 0.55 - 0.3));
      }
    }
    // Keep a gap to whatever is ahead.
    const gap = this.scanAhead(game, 24);
    if (gap < Infinity) desired = Math.min(desired, Math.max(0, (gap - 2.5) * 0.8));
    if (this.blockedBy === 'player' && gap < 8 && Math.abs(speed) < 1) {
      this.honkTimer += dt;
      if (this.honkTimer > 2.2) {
        this.honkTimer = -1.5;
        game.events.emit('horn', { vehicle: v });
      }
    }

    if (this.reverse > 0) {
      this.reverse -= dt;
      c.throttle = -0.7;
      c.brake = false;
      c.steer = -clamp(angleDelta(v.heading, headingTo(v.position.x, v.position.z, target.x, target.z)) * 2, -1, 1);
      return;
    }
    const steer = clamp(angleDelta(v.heading, headingTo(v.position.x, v.position.z, target.x, target.z)) * 2.4, -1, 1);
    c.steer = steer;
    c.handbrake = false;
    if (speed < desired - 0.6) {
      c.throttle = clamp((desired - speed) * 0.35, 0.25, 1);
      c.brake = false;
    } else if (speed > desired + 1.2) {
      c.throttle = 0;
      c.brake = true;
    } else {
      c.throttle = 0.1;
      c.brake = false;
    }
    if (desired < 0.3 && speed < 1) {
      c.throttle = 0;
      c.brake = true;
    }
    // Unstick from walls.
    if (desired > 3 && Math.abs(speed) < 0.6) {
      this.stuck += dt;
      if (this.stuck > 2.5) {
        this.stuck = 0;
        this.reverse = 1.4;
      }
    } else {
      this.stuck = 0;
    }
    this.panic = Math.max(0, this.panic - dt);
  }
}
