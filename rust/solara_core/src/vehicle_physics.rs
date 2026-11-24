//! Arcade car physics for every car in one call: engine curve, brakes and reverse, drag, lateral
//! tyre grip that lets go under the handbrake for drifts, a bicycle-model yaw capped by grip,
//! two-circle collision against the city, ground and water following, and mass-weighted
//! car-to-car crashes. JavaScript packs each car into a row of `STRIDE` values in the exchange
//! buffer, calls `vehicles_step`, then `vehicles_collide`, and reads the rows (and the crash
//! list after them) back to apply damage, sounds and effects.

use crate::city_layout::{WATER_LEVEL, ground_height, surface_height};
use crate::collision;
use crate::{clamp, damp, io};

/// Values per car in the exchange buffer.
pub const STRIDE: usize = 34;

// Row layout. State (read and written back):
pub const X: usize = 0;
pub const Y: usize = 1;
pub const Z: usize = 2;
pub const HEADING: usize = 3;
pub const VX: usize = 4;
pub const VZ: usize = 5;
pub const YAW_RATE: usize = 6;
pub const STEER: usize = 7;
// Controls:
pub const THROTTLE: usize = 8;
pub const STEER_INPUT: usize = 9;
pub const BRAKE: usize = 10;
pub const HANDBRAKE: usize = 11;
// Spec:
pub const ACCEL: usize = 12;
pub const BRAKE_FORCE: usize = 13;
pub const MAX_SPEED: usize = 14;
pub const GRIP: usize = 15;
pub const STEER_LOCK: usize = 16;
pub const LENGTH: usize = 17;
pub const RADIUS: usize = 18;
pub const HEALTH_FACTOR: usize = 19;
pub const MASS: usize = 20;
// Results:
pub const FORWARD_SPEED: usize = 22;
pub const LATERAL_SPEED: usize = 23;
pub const ACCEL_F: usize = 24;
pub const IMPACT_FRONT: usize = 25;
pub const IMPACT_FRONT_X: usize = 26;
pub const IMPACT_FRONT_Z: usize = 27;
pub const IMPACT_REAR: usize = 28;
pub const IMPACT_REAR_X: usize = 29;
pub const IMPACT_REAR_Z: usize = 30;
pub const DRIFTING: usize = 31;
pub const GROUND: usize = 32;
pub const LAST_IMPACT: usize = 33;

/// Values per crash row written after the cars: [a, b, impact, shareA, shareB, x, z].
pub const CRASH_STRIDE: usize = 7;

/// JavaScript's Math.sign (0 stays 0).
fn sign(v: f64) -> f64 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        0.0
    }
}

fn axle_circles(row: &[f64]) -> [(f64, f64); 2] {
    let (fx, fz) = (row[HEADING].sin(), row[HEADING].cos());
    let off = row[LENGTH] / 2.0 - row[RADIUS];
    [(row[X] + fx * off, row[Z] + fz * off), (row[X] - fx * off, row[Z] - fz * off)]
}

/// Advance one car by dt.
pub fn step_car(row: &mut [f64], dt: f64) {
    let throttle = row[THROTTLE];
    let brake = row[BRAKE] != 0.0;
    let handbrake = row[HANDBRAKE] != 0.0;
    let (accel, brake_force, max_speed, grip) = (row[ACCEL], row[BRAKE_FORCE], row[MAX_SPEED], row[GRIP]);
    let (fx, fz) = (row[HEADING].sin(), row[HEADING].cos());
    let (rx, rz) = (-fz, fx);
    let mut v_f = row[VX] * fx + row[VZ] * fz;
    let mut v_r = row[VX] * rx + row[VZ] * rz;

    // Engine, brakes and drag along the car.
    let mut accel_f = 0.0;
    if throttle > 0.05 {
        accel_f = if v_f < -0.5 {
            brake_force * throttle
        } else {
            accel * throttle * row[HEALTH_FACTOR] * (1.0 - clamp(v_f / max_speed, 0.0, 1.0).powi(2))
        };
    } else if throttle < -0.05 {
        accel_f = if v_f > 0.5 {
            -brake_force * -throttle
        } else if v_f > -max_speed * 0.3 {
            -accel * 0.6 * -throttle
        } else {
            0.0
        };
    }
    v_f += accel_f * dt;
    if brake {
        v_f -= sign(v_f) * v_f.abs().min(brake_force * dt);
    }
    if throttle.abs() < 0.05 {
        v_f -= sign(v_f) * v_f.abs().min(2.2 * dt);
    }
    v_f -= v_f * v_f.abs() * 0.0009 * dt;
    if handbrake {
        v_f -= sign(v_f) * v_f.abs().min(brake_force * 0.35 * dt);
    }

    // Lateral grip: the handbrake lets the rear step out.
    let lateral_grip = if handbrake { grip * 0.18 } else { grip * if v_r.abs() > 6.0 { 0.55 } else { 1.0 } };
    v_r *= 1.0 - damp(lateral_grip, dt);
    row[DRIFTING] = if v_r.abs() > 3.2 && v_f.abs() > 8.0 { 1.0 } else { 0.0 };

    // Steering: less lock at speed; yaw from a bicycle model, capped by what the tyres can hold.
    let speed_ratio = clamp(v_f.abs() / max_speed, 0.0, 1.0);
    let target_steer = row[STEER_INPUT] * row[STEER_LOCK] * (1.0 - 0.6 * speed_ratio);
    row[STEER] += (target_steer - row[STEER]) * damp(10.0, dt);
    let wheelbase = row[LENGTH] * 0.6;
    let mut yaw = v_f / wheelbase * row[STEER].tan();
    if handbrake && v_f.abs() > 5.0 {
        yaw *= 1.35;
    }
    let max_yaw = grip * 2.2 / v_f.abs().max(5.0) * if handbrake { 2.2 } else { 1.0 };
    yaw = clamp(yaw, -max_yaw, max_yaw);
    row[YAW_RATE] += (yaw - row[YAW_RATE]) * damp(if handbrake { 5.0 } else { 12.0 }, dt);
    row[HEADING] += row[YAW_RATE] * dt;

    row[VX] = fx * v_f + rx * v_r;
    row[VZ] = fz * v_f + rz * v_r;
    row[FORWARD_SPEED] = v_f;
    row[LATERAL_SPEED] = v_r;
    row[ACCEL_F] = accel_f;
    row[X] += row[VX] * dt;
    row[Z] += row[VZ] * dt;

    // Static collision with both axle circles.
    let world = collision::world();
    let radius = row[RADIUS];
    let circles = axle_circles(row);
    let mut last_impact: f64 = 0.0;
    for (k, (cx, cz)) in circles.into_iter().enumerate() {
        let slot = if k == 0 { IMPACT_FRONT } else { IMPACT_REAR };
        row[slot] = 0.0;
        let c = world.resolve_circle(cx, cz, radius, row[Y]);
        if !c.hit {
            continue;
        }
        row[X] += c.x - cx;
        row[Z] += c.z - cz;
        let vn = row[VX] * c.nx + row[VZ] * c.nz;
        if vn < 0.0 {
            row[VX] = (row[VX] - c.nx * vn * 1.3) * 0.85;
            row[VZ] = (row[VZ] - c.nz * vn * 1.3) * 0.85;
            let impact = -vn;
            last_impact = last_impact.max(impact);
            // A glancing hit at the front turns the car away from the wall.
            row[YAW_RATE] += if k == 0 { 1.0 } else { -1.0 } * (c.nx * fz - c.nz * fx) * impact * 0.05;
            row[slot] = impact;
            row[slot + 1] = cx;
            row[slot + 2] = cz;
        }
    }
    row[LAST_IMPACT] = last_impact;

    // Ground and water.
    let ground = ground_height(row[X], row[Z]);
    row[GROUND] = ground;
    if ground < WATER_LEVEL - 0.6 {
        row[Y] += (ground.max(WATER_LEVEL - 1.6) - row[Y]) * damp(1.2, dt);
        let drag = 1.0 - damp(1.5, dt);
        row[VX] *= drag;
        row[VZ] *= drag;
    } else {
        row[Y] += (surface_height(row[X], row[Z]) - row[Y]) * damp(18.0, dt);
    }
}

/// Push overlapping cars apart (lighter cars move more) and bounce them; crashes harder than
/// 3 m/s are appended to `crashes` as [a, b, impact, shareA, shareB, x, z].
pub fn collide_cars(rows: &mut [f64], count: usize, crashes: &mut Vec<f64>) {
    for i in 0..count {
        let ca = axle_circles(&rows[i * STRIDE..(i + 1) * STRIDE]);
        for j in i + 1..count {
            let (head, tail) = rows.split_at_mut(j * STRIDE);
            let a = &mut head[i * STRIDE..(i + 1) * STRIDE];
            let b = &mut tail[..STRIDE];
            let (dx0, dz0) = (b[X] - a[X], b[Z] - a[Z]);
            let reach = a[LENGTH] / 2.0 + b[LENGTH] / 2.0;
            if dx0 * dx0 + dz0 * dz0 > reach * reach {
                continue;
            }
            let cb = axle_circles(b);
            for pa in ca {
                for pb in cb {
                    let (mut dx, mut dz) = (pb.0 - pa.0, pb.1 - pa.1);
                    let min_d = a[RADIUS] + b[RADIUS];
                    let d2 = dx * dx + dz * dz;
                    if d2 >= min_d * min_d || d2 < 1e-6 {
                        continue;
                    }
                    let d = d2.sqrt();
                    dx /= d;
                    dz /= d;
                    let overlap = min_d - d;
                    let (ma, mb) = (a[MASS], b[MASS]);
                    let (ta, tb) = (mb / (ma + mb), ma / (ma + mb));
                    a[X] -= dx * overlap * ta;
                    a[Z] -= dz * overlap * ta;
                    b[X] += dx * overlap * tb;
                    b[Z] += dz * overlap * tb;
                    let rel = (b[VX] - a[VX]) * dx + (b[VZ] - a[VZ]) * dz;
                    if rel < 0.0 {
                        let impulse = -1.25 * rel / (1.0 / ma + 1.0 / mb);
                        a[VX] -= impulse / ma * dx;
                        a[VZ] -= impulse / ma * dz;
                        b[VX] += impulse / mb * dx;
                        b[VZ] += impulse / mb * dz;
                        let impact = -rel;
                        if impact > 3.0 {
                            crashes.extend_from_slice(&[i as f64, j as f64, impact, ta, tb, (pa.0 + pb.0) / 2.0, (pa.1 + pb.1) / 2.0]);
                        }
                    }
                }
            }
        }
    }
}

// ---- exports ---------------------------------------------------------------------------------

/// Step `count` packed cars by dt.
#[unsafe(no_mangle)]
pub extern "C" fn vehicles_step(count: u32, dt: f64) {
    let n = count as usize;
    let rows = &mut io(n * STRIDE)[..n * STRIDE];
    for row in rows.chunks_exact_mut(STRIDE) {
        step_car(row, dt);
    }
}

/// Resolve car-to-car contacts among `count` packed cars. Crash rows are written right after the
/// cars in the exchange buffer; returns how many there are.
#[unsafe(no_mangle)]
pub extern "C" fn vehicles_collide(count: u32) -> u32 {
    let n = count as usize;
    let mut crashes = Vec::new();
    collide_cars(&mut io(n * STRIDE)[..n * STRIDE], n, &mut crashes);
    let buf = io(n * STRIDE + crashes.len());
    buf[n * STRIDE..n * STRIDE + crashes.len()].copy_from_slice(&crashes);
    (crashes.len() / CRASH_STRIDE) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn car(x: f64, z: f64, heading: f64) -> Vec<f64> {
        let mut row = vec![0.0; STRIDE];
        row[X] = x;
        row[Z] = z;
        row[HEADING] = heading;
        row[ACCEL] = 12.0;
        row[BRAKE_FORCE] = 24.0;
        row[MAX_SPEED] = 50.0;
        row[GRIP] = 8.0;
        row[STEER_LOCK] = 0.55;
        row[LENGTH] = 4.6;
        row[RADIUS] = 1.1;
        row[HEALTH_FACTOR] = 1.0;
        row[MASS] = 1400.0;
        row
    }

    #[test]
    fn throttle_accelerates_and_steering_turns() {
        let mut row = car(0.0, 0.0, 0.0);
        row[THROTTLE] = 1.0;
        for _ in 0..120 {
            step_car(&mut row, 1.0 / 60.0);
        }
        assert!(row[FORWARD_SPEED] > 9.0 && row[Z] > 5.0);
        row[STEER_INPUT] = 1.0;
        for _ in 0..60 {
            step_car(&mut row, 1.0 / 60.0);
        }
        assert!(row[HEADING] > 0.2);
    }

    #[test]
    fn head_on_crash_is_reported() {
        let mut a = car(0.0, 0.0, 0.0);
        a[VZ] = 10.0;
        let mut b = car(0.0, 4.0, std::f64::consts::PI);
        b[VZ] = -10.0;
        let mut rows = [a, b].concat();
        let mut crashes = Vec::new();
        collide_cars(&mut rows, 2, &mut crashes);
        assert!(!crashes.is_empty());
        assert!(rows[VZ] < 0.0 && rows[STRIDE + VZ] > 0.0);
    }
}
