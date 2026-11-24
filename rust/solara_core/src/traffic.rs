//! Street life: traffic signal timing, a per-step obstacle grid of every car and person, the
//! lane-following decision of AI drivers (look-ahead target on the right-hand lane, slowing for
//! turns, red lights and whatever is ahead, backing out when stuck), and pedestrian steering
//! toward a target with collision against the city in one call.

use crate::city_layout::ROAD_HALF;
use crate::collision;
use crate::{Shared, clamp, damp, heading_to, io, wrap_angle};

pub const SIGNAL_CYCLE: f64 = 24.0;
pub const STOP_DISTANCE: f64 = ROAD_HALF + 6.5;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Light {
    Green = 0,
    Yellow = 1,
    Red = 2,
}

/// Signal state for (north-south, east-west) approaches at world time t.
pub fn signal_states(t: f64) -> (Light, Light) {
    let p = t % SIGNAL_CYCLE;
    if p < 9.0 {
        (Light::Green, Light::Red)
    } else if p < 11.0 {
        (Light::Yellow, Light::Red)
    } else if p < 12.0 {
        (Light::Red, Light::Red)
    } else if p < 21.0 {
        (Light::Red, Light::Green)
    } else if p < 23.0 {
        (Light::Red, Light::Yellow)
    } else {
        (Light::Red, Light::Red)
    }
}

/// What an AI driver can find in its path.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Blocker {
    Car = 0,
    Player = 1,
    Pedestrian = 2,
}

impl Blocker {
    fn from_code(code: f64) -> Blocker {
        match code as i32 {
            1 => Blocker::Player,
            2 => Blocker::Pedestrian,
            _ => Blocker::Car,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Obstacle {
    x: f64,
    z: f64,
    half_width: f64,
    kind: Blocker,
}

const OBSTACLE_CELL: f64 = 24.0;
const BUCKETS: usize = 64;

/// Cars and people this step, bucketed in a wrapped 64 x 64 grid of 24 m cells.
pub struct ObstacleField {
    items: Vec<Obstacle>,
    buckets: Vec<Vec<u32>>,
}

fn bucket_coord(v: f64) -> i64 {
    (v / OBSTACLE_CELL).floor() as i64
}

fn bucket_index(cx: i64, cz: i64) -> usize {
    (cx.rem_euclid(BUCKETS as i64) as usize) * BUCKETS + cz.rem_euclid(BUCKETS as i64) as usize
}

impl ObstacleField {
    pub const fn new() -> Self {
        ObstacleField { items: Vec::new(), buckets: Vec::new() }
    }

    fn load(&mut self, rows: &[f64]) {
        if self.buckets.is_empty() {
            self.buckets = vec![Vec::new(); BUCKETS * BUCKETS];
        }
        self.buckets.iter_mut().for_each(Vec::clear);
        self.items.clear();
        for row in rows.chunks_exact(4) {
            let id = self.items.len() as u32;
            self.items.push(Obstacle { x: row[0], z: row[1], half_width: row[2], kind: Blocker::from_code(row[3]) });
            self.buckets[bucket_index(bucket_coord(row[0]), bucket_coord(row[1]))].push(id);
        }
    }

    /// Distance from the front bumper to the nearest obstacle in a car's path within `range`
    /// (infinity when clear), and what it is. `skip` is the car's own obstacle index.
    pub fn scan_ahead(&self, x: f64, z: f64, heading: f64, range: f64, width: f64, length: f64, skip: i64) -> (f64, Option<Blocker>) {
        let (fx, fz) = (heading.sin(), heading.cos());
        let mut nearest = f64::INFINITY;
        let mut blocker = None;
        if self.buckets.is_empty() {
            return (nearest, blocker);
        }
        let (c0x, c1x) = (bucket_coord(x - range), bucket_coord(x + range));
        let (c0z, c1z) = (bucket_coord(z - range), bucket_coord(z + range));
        for cx in c0x..=c1x {
            for cz in c0z..=c1z {
                for &id in &self.buckets[bucket_index(cx, cz)] {
                    if i64::from(id) == skip {
                        continue;
                    }
                    let o = &self.items[id as usize];
                    let (dx, dz) = (o.x - x, o.z - z);
                    if dx * dx + dz * dz > range * range {
                        continue;
                    }
                    let f = dx * fx + dz * fz;
                    if f <= 0.0 || f > range {
                        continue;
                    }
                    let lateral = (-dx * fz + dz * fx).abs();
                    if lateral < o.half_width + width / 2.0 + 0.3 && f < nearest {
                        nearest = f;
                        blocker = Some(o.kind);
                    }
                }
            }
        }
        (nearest - length / 2.0, blocker)
    }
}

impl Default for ObstacleField {
    fn default() -> Self {
        Self::new()
    }
}

/// One AI driver's situation on its lane.
#[derive(Clone, Copy, Debug, Default)]
pub struct LaneInput {
    pub from: (f64, f64),
    pub to: (f64, f64),
    pub next: Option<(f64, f64)>,
    pub x: f64,
    pub z: f64,
    pub heading: f64,
    pub speed: f64,
    pub lane: f64,
    pub cruise: f64,
    pub panic: f64,
    pub obey_signals: bool,
    pub to_degree: u32,
    pub world_time: f64,
    pub reversing: bool,
    pub self_index: i64,
    pub width: f64,
    pub length: f64,
}

/// The driver's decision this step.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LaneOutput {
    /// The junction ahead is reached: move on to the next road (no controls this step).
    pub advance: bool,
    pub throttle: f64,
    pub steer: f64,
    pub brake: bool,
    pub desired: f64,
    pub gap: f64,
    pub blocker: Option<Blocker>,
}

fn unit(a: (f64, f64), b: (f64, f64)) -> (f64, f64, f64) {
    let (dx, dz) = (b.0 - a.0, b.1 - a.1);
    let len = dx.hypot(dz);
    (dx / len, dz / len, len)
}

/// A point on the right-hand lane from `a` toward `b`, t metres along, `lane` metres off centre.
pub fn lane_point(a: (f64, f64), b: (f64, f64), t: f64, lane: f64) -> (f64, f64) {
    let (dx, dz, _) = unit(a, b);
    (a.0 + dx * t - dz * lane, a.1 + dz * t + dx * lane)
}

/// Lane following: where to aim, how fast to go, and the pedals and wheel to get there.
pub fn lane_drive(inp: &LaneInput, field: &ObstacleField) -> LaneOutput {
    let mut out = LaneOutput { gap: f64::INFINITY, ..LaneOutput::default() };
    let (dx, dz, len) = unit(inp.from, inp.to);
    let t = (inp.x - inp.from.0) * dx + (inp.z - inp.from.1) * dz;
    let remaining = len - t;
    if remaining < ROAD_HALF * 0.6 {
        out.advance = true;
        return out;
    }
    let look = 6.0 + inp.speed.abs() * 0.55;
    let target = match inp.next {
        Some(next) if remaining <= look => lane_point(inp.to, next, look - remaining + ROAD_HALF * 0.7, inp.lane),
        _ => lane_point(inp.from, inp.to, len.min(t + look), inp.lane),
    };

    let mut desired = if inp.panic > 0.0 { inp.cruise * 1.7 } else { inp.cruise };
    if let Some(next) = inp.next {
        let (nx, nz, _) = unit(inp.to, next);
        let turning = dx * nx + dz * nz < 0.7;
        if turning && remaining < 28.0 {
            desired = desired.min(if inp.panic > 0.0 { 11.0 } else { 7.0 });
        }
    }
    // Signals at junctions of three or more streets.
    if inp.obey_signals && inp.panic <= 0.0 && inp.to_degree >= 3 {
        let (ns, ew) = signal_states(inp.world_time);
        let light = if dz.abs() > 0.5 { ns } else { ew };
        let to_stop = remaining - STOP_DISTANCE;
        if to_stop > -1.0 && to_stop < 30.0 && (light == Light::Red || (light == Light::Yellow && to_stop > 6.0)) {
            desired = desired.min((to_stop * 0.55 - 0.3).max(0.0));
        }
    }
    // Keep a gap to whatever is ahead.
    let (gap, blocker) = field.scan_ahead(inp.x, inp.z, inp.heading, 24.0, inp.width, inp.length, inp.self_index);
    out.gap = gap;
    out.blocker = blocker;
    if gap.is_finite() {
        desired = desired.min(((gap - 2.5) * 0.8).max(0.0));
    }
    out.desired = desired;

    let delta = wrap_angle(heading_to(inp.x, inp.z, target.0, target.1) - inp.heading);
    if inp.reversing {
        out.throttle = -0.7;
        out.brake = false;
        out.steer = -clamp(delta * 2.0, -1.0, 1.0);
        return out;
    }
    out.steer = clamp(delta * 2.4, -1.0, 1.0);
    let speed = inp.speed;
    if speed < desired - 0.6 {
        out.throttle = clamp((desired - speed) * 0.35, 0.25, 1.0);
    } else if speed > desired + 1.2 {
        out.brake = true;
    } else {
        out.throttle = 0.1;
    }
    if desired < 0.3 && speed < 1.0 {
        out.throttle = 0.0;
        out.brake = true;
    }
    out
}

/// Walk a pedestrian toward (tx, tz) at `speed`, turning smoothly, then push them out of walls.
/// Returns (x, z, heading, distance to the target before the step).
#[allow(clippy::too_many_arguments)]
pub fn walk_toward(x: f64, z: f64, heading: f64, tx: f64, tz: f64, speed: f64, dt: f64, radius: f64, foot_y: f64) -> (f64, f64, f64, f64) {
    let (dx, dz) = (tx - x, tz - z);
    let d = dx.hypot(dz);
    if d < 0.05 {
        return (x, z, heading, d);
    }
    let want = dx.atan2(dz);
    let heading = heading + wrap_angle(want - heading) * damp(8.0, dt);
    let step = d.min(speed * dt);
    let c = collision::world().resolve_circle(x + dx / d * step, z + dz / d * step, radius, foot_y);
    (c.x, c.z, heading, d)
}

static FIELD: Shared<ObstacleField> = Shared::new(ObstacleField::new());
static LAST_BLOCKER: Shared<i32> = Shared::new(-1);

fn blocker_code(b: Option<Blocker>) -> f64 {
    b.map_or(-1.0, |b| f64::from(b as i32))
}

// ---- exports ---------------------------------------------------------------------------------

/// Signal phase at time t as north-south * 3 + east-west (0 green, 1 yellow, 2 red).
#[unsafe(no_mangle)]
pub extern "C" fn traffic_signal_phase(t: f64) -> u32 {
    let (ns, ew) = signal_states(t);
    ns as u32 * 3 + ew as u32
}

/// Load this step's obstacles from the exchange buffer: `count` rows of [x, z, halfWidth, kind]
/// (kind 0 car, 1 the player, 2 pedestrian). Cars come first, in game.vehicles order.
#[unsafe(no_mangle)]
pub extern "C" fn traffic_load_obstacles(count: u32) {
    let rows = &io(count as usize * 4)[..count as usize * 4];
    FIELD.get().load(rows);
}

/// Gap ahead of a car (infinity when clear); `traffic_last_blocker` tells what it was.
#[unsafe(no_mangle)]
pub extern "C" fn traffic_scan_ahead(x: f64, z: f64, heading: f64, range: f64, width: f64, length: f64, skip: i32) -> f64 {
    let (gap, blocker) = FIELD.get().scan_ahead(x, z, heading, range, width, length, i64::from(skip));
    *LAST_BLOCKER.get() = blocker_code(blocker) as i32;
    gap
}

#[unsafe(no_mangle)]
pub extern "C" fn traffic_last_blocker() -> i32 {
    *LAST_BLOCKER.get()
}

/// Lane-follow decision. Reads 21 inputs from the exchange buffer:
/// [fromX, fromZ, toX, toZ, hasNext, nextX, nextZ, x, z, heading, speed, lane, cruise, panic,
///  obeySignals, toDegree, worldTime, reversing, selfIndex, width, length]
/// and writes [advance, throttle, steer, brake, desired, gap, blocker].
#[unsafe(no_mangle)]
pub extern "C" fn traffic_lane_drive() {
    let buf = io(21);
    let inp = LaneInput {
        from: (buf[0], buf[1]),
        to: (buf[2], buf[3]),
        next: if buf[4] != 0.0 { Some((buf[5], buf[6])) } else { None },
        x: buf[7],
        z: buf[8],
        heading: buf[9],
        speed: buf[10],
        lane: buf[11],
        cruise: buf[12],
        panic: buf[13],
        obey_signals: buf[14] != 0.0,
        to_degree: buf[15] as u32,
        world_time: buf[16],
        reversing: buf[17] != 0.0,
        self_index: buf[18] as i64,
        width: buf[19],
        length: buf[20],
    };
    let out = lane_drive(&inp, FIELD.get());
    let buf = io(7);
    buf[0] = if out.advance { 1.0 } else { 0.0 };
    buf[1] = out.throttle;
    buf[2] = out.steer;
    buf[3] = if out.brake { 1.0 } else { 0.0 };
    buf[4] = out.desired;
    buf[5] = out.gap;
    buf[6] = blocker_code(out.blocker);
}

/// Pedestrian steering step; writes [x, z, heading] and returns the distance to the target.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn crowd_walk_toward(x: f64, z: f64, heading: f64, tx: f64, tz: f64, speed: f64, dt: f64, radius: f64, foot_y: f64) -> f64 {
    let (nx, nz, nh, d) = walk_toward(x, z, heading, tx, tz, speed, dt, radius, foot_y);
    let out = io(3);
    out[0] = nx;
    out[1] = nz;
    out[2] = nh;
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signal_cycle() {
        assert_eq!(signal_states(1.0), (Light::Green, Light::Red));
        assert_eq!(signal_states(15.0), (Light::Red, Light::Green));
        assert_eq!(signal_states(24.0 + 10.0), (Light::Yellow, Light::Red));
    }

    #[test]
    fn driver_stops_behind_a_car() {
        let mut field = ObstacleField::new();
        // Our car (index 0) at z = 0 heading +z, a stopped car 10 m ahead in the same lane.
        field.load(&[3.5, 0.0, 0.95, 0.0, 3.5, 10.0, 0.95, 0.0]);
        let inp = LaneInput {
            from: (0.0, -50.0),
            to: (0.0, 100.0),
            x: 3.5,
            z: 0.0,
            heading: 0.0,
            speed: 10.0,
            lane: -3.5,
            cruise: 12.0,
            width: 1.9,
            length: 4.6,
            self_index: 0,
            ..LaneInput::default()
        };
        let out = lane_drive(&inp, &field);
        assert!(!out.advance);
        assert_eq!(out.blocker, Some(Blocker::Car));
        assert!((out.gap - 7.7).abs() < 1e-9);
        assert!(out.brake);
    }
}
