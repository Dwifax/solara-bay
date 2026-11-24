//! Static collision for the city. Every building, wall and big prop is an axis-aligned box kept
//! in a dense spatial hash of 16 m cells over the whole map. Circles (people, cars) are pushed out
//! of boxes, rays (bullets, the chase camera, police line of sight) walk the grid cell by cell.

use crate::{Shared, io};

const CELL: f64 = 16.0;
const ORIGIN_X: f64 = -656.0;
const ORIGIN_Z: f64 = -656.0;
const COLS: i32 = 92; // covers x in [-656, 816)
const ROWS: i32 = 80; // covers z in [-656, 624)

#[derive(Clone, Copy, Debug)]
pub struct Aabb {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub min_y: f64,
    pub max_y: f64,
}

/// Result of pushing a circle out of the world.
#[derive(Clone, Copy, Debug, Default)]
pub struct Contact {
    pub x: f64,
    pub z: f64,
    pub hit: bool,
    pub nx: f64,
    pub nz: f64,
    pub depth: f64,
}

pub struct CollisionWorld {
    boxes: Vec<Aabb>,
    marks: Vec<u32>,
    cells: Vec<Vec<u32>>,
    stamp: u32,
    scratch: Vec<u32>,
}

fn cell_x(x: f64) -> i32 {
    (((x - ORIGIN_X) / CELL).floor() as i32).clamp(0, COLS - 1)
}

fn cell_z(z: f64) -> i32 {
    (((z - ORIGIN_Z) / CELL).floor() as i32).clamp(0, ROWS - 1)
}

impl CollisionWorld {
    pub const fn new() -> Self {
        CollisionWorld { boxes: Vec::new(), marks: Vec::new(), cells: Vec::new(), stamp: 1, scratch: Vec::new() }
    }

    pub fn clear(&mut self) {
        self.boxes.clear();
        self.marks.clear();
        self.cells.clear();
        self.cells.resize((COLS * ROWS) as usize, Vec::new());
    }

    pub fn add_box(&mut self, b: Aabb) -> u32 {
        if self.cells.is_empty() {
            self.clear();
        }
        let id = self.boxes.len() as u32;
        self.boxes.push(b);
        self.marks.push(0);
        for cz in cell_z(b.min_z)..=cell_z(b.max_z) {
            for cx in cell_x(b.min_x)..=cell_x(b.max_x) {
                self.cells[(cz * COLS + cx) as usize].push(id);
            }
        }
        id
    }

    fn next_stamp(&mut self) -> u32 {
        self.stamp = self.stamp.wrapping_add(1);
        if self.stamp == 0 {
            self.marks.iter_mut().for_each(|m| *m = 0);
            self.stamp = 1;
        }
        self.stamp
    }

    /// Collect the ids of boxes in cells touching the square of half-size r around (x, z).
    fn gather(&mut self, x: f64, z: f64, r: f64) {
        let stamp = self.next_stamp();
        self.scratch.clear();
        if self.cells.is_empty() {
            return;
        }
        for cz in cell_z(z - r)..=cell_z(z + r) {
            for cx in cell_x(x - r)..=cell_x(x + r) {
                for &id in &self.cells[(cz * COLS + cx) as usize] {
                    let mark = &mut self.marks[id as usize];
                    if *mark != stamp {
                        *mark = stamp;
                        self.scratch.push(id);
                    }
                }
            }
        }
    }

    /// Push a circle at (x, z) of radius r out of every box it overlaps whose top is above the
    /// feet (foot_y); two passes settle corners. Reports the normal of the deepest contact.
    pub fn resolve_circle(&mut self, mut x: f64, mut z: f64, r: f64, foot_y: f64) -> Contact {
        let mut c = Contact::default();
        self.gather(x, z, r + 1.0);
        for _pass in 0..2 {
            for &id in &self.scratch {
                let b = &self.boxes[id as usize];
                if b.max_y <= foot_y + 0.4 || b.min_y > foot_y + 1.6 {
                    continue;
                }
                let px = x.clamp(b.min_x, b.max_x);
                let pz = z.clamp(b.min_z, b.max_z);
                let (mut dx, mut dz) = (x - px, z - pz);
                let d2 = dx * dx + dz * dz;
                if d2 >= r * r {
                    continue;
                }
                let depth;
                if d2 > 1e-8 {
                    let d = d2.sqrt();
                    dx /= d;
                    dz /= d;
                    depth = r - d;
                } else {
                    // Centre inside the box: leave by the nearest face.
                    let left = x - b.min_x;
                    let right = b.max_x - x;
                    let top = z - b.min_z;
                    let bottom = b.max_z - z;
                    let m = left.min(right).min(top).min(bottom);
                    dx = if m == left { -1.0 } else if m == right { 1.0 } else { 0.0 };
                    dz = if m == top { -1.0 } else if m == bottom { 1.0 } else { 0.0 };
                    depth = m + r;
                }
                x += dx * depth;
                z += dz * depth;
                c.hit = true;
                if depth > c.depth {
                    c.depth = depth;
                    c.nx = dx;
                    c.nz = dz;
                }
            }
        }
        c.x = x;
        c.z = z;
        c
    }

    /// Distance along a unit ray to the first box within max_dist, or infinity. The ray walks the
    /// grid cells it crosses in order (a 2D DDA over x/z) and stops once a hit is closer than the
    /// far edge of the current cell.
    pub fn raycast(&mut self, o: [f64; 3], d: [f64; 3], max_dist: f64) -> f64 {
        if self.cells.is_empty() {
            return f64::INFINITY;
        }
        let stamp = self.next_stamp();
        let mut best = f64::INFINITY;
        let mut cx = cell_x(o[0]);
        let mut cz = cell_z(o[2]);
        let step_x = if d[0] > 0.0 { 1 } else { -1 };
        let step_z = if d[2] > 0.0 { 1 } else { -1 };
        let inv = |v: f64| if v.abs() < 1e-12 { f64::INFINITY } else { 1.0 / v.abs() };
        let delta_x = CELL * inv(d[0]);
        let delta_z = CELL * inv(d[2]);
        let edge_x = ORIGIN_X + f64::from(cx + i32::from(step_x > 0)) * CELL;
        let edge_z = ORIGIN_Z + f64::from(cz + i32::from(step_z > 0)) * CELL;
        let mut t_x = if d[0].abs() < 1e-12 { f64::INFINITY } else { (edge_x - o[0]) / d[0] };
        let mut t_z = if d[2].abs() < 1e-12 { f64::INFINITY } else { (edge_z - o[2]) / d[2] };
        loop {
            for &id in &self.cells[(cz * COLS + cx) as usize] {
                let mark = &mut self.marks[id as usize];
                if *mark == stamp {
                    continue;
                }
                *mark = stamp;
                let t = ray_box(o, d, &self.boxes[id as usize]);
                if t < best {
                    best = t;
                }
            }
            let t_exit = t_x.min(t_z);
            if best <= t_exit || t_exit > max_dist {
                break;
            }
            if t_x < t_z {
                cx += step_x;
                t_x += delta_x;
            } else {
                cz += step_z;
                t_z += delta_z;
            }
            if cx < 0 || cx >= COLS || cz < 0 || cz >= ROWS {
                break;
            }
        }
        if best <= max_dist { best } else { f64::INFINITY }
    }

    /// True when a point lies inside any box taller than 0.5 m (grown by margin).
    pub fn point_blocked(&mut self, x: f64, z: f64, margin: f64) -> bool {
        self.gather(x, z, margin + 1.0);
        self.scratch.iter().any(|&id| {
            let b = &self.boxes[id as usize];
            x > b.min_x - margin && x < b.max_x + margin && z > b.min_z - margin && z < b.max_z + margin && b.max_y > 0.5
        })
    }
}

impl Default for CollisionWorld {
    fn default() -> Self {
        Self::new()
    }
}

/// Slab test of a ray against a box; entry distance (0 when starting inside) or infinity.
fn ray_box(o: [f64; 3], d: [f64; 3], b: &Aabb) -> f64 {
    let mut tmin: f64 = 0.0;
    let mut tmax = f64::INFINITY;
    let slabs = [(o[0], d[0], b.min_x, b.max_x), (o[1], d[1], b.min_y, b.max_y), (o[2], d[2], b.min_z, b.max_z)];
    for (o, d, lo, hi) in slabs {
        if d.abs() < 1e-9 {
            if o < lo || o > hi {
                return f64::INFINITY;
            }
        } else {
            let mut t1 = (lo - o) / d;
            let mut t2 = (hi - o) / d;
            if t1 > t2 {
                std::mem::swap(&mut t1, &mut t2);
            }
            tmin = tmin.max(t1);
            tmax = tmax.min(t2);
            if tmin > tmax {
                return f64::INFINITY;
            }
        }
    }
    tmin
}

static WORLD: Shared<CollisionWorld> = Shared::new(CollisionWorld::new());

pub(crate) fn world() -> &'static mut CollisionWorld {
    WORLD.get()
}

// ---- exports ---------------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn collision_reset() {
    world().clear();
}

#[unsafe(no_mangle)]
pub extern "C" fn collision_add_box(min_x: f64, max_x: f64, min_z: f64, max_z: f64, min_y: f64, max_y: f64) -> u32 {
    world().add_box(Aabb { min_x, max_x, min_z, max_z, min_y, max_y })
}

/// Resolve a circle; writes [x, z, nx, nz, depth] to the exchange buffer and returns 1 on a hit.
#[unsafe(no_mangle)]
pub extern "C" fn collision_resolve_circle(x: f64, z: f64, r: f64, foot_y: f64) -> u32 {
    let c = world().resolve_circle(x, z, r, foot_y);
    let out = io(5);
    out[0] = c.x;
    out[1] = c.z;
    out[2] = c.nx;
    out[3] = c.nz;
    out[4] = c.depth;
    u32::from(c.hit)
}

#[unsafe(no_mangle)]
pub extern "C" fn collision_raycast(ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, max_dist: f64) -> f64 {
    world().raycast([ox, oy, oz], [dx, dy, dz], max_dist)
}

/// 1 when nothing solid lies between the two points.
#[unsafe(no_mangle)]
pub extern "C" fn collision_line_clear(ax: f64, ay: f64, az: f64, bx: f64, by: f64, bz: f64) -> u32 {
    let (dx, dy, dz) = (bx - ax, by - ay, bz - az);
    let len = (dx * dx + dy * dy + dz * dz).sqrt();
    if len < 0.01 {
        return 1;
    }
    u32::from(world().raycast([ax, ay, az], [dx / len, dy / len, dz / len], len) == f64::INFINITY)
}

#[unsafe(no_mangle)]
pub extern "C" fn collision_point_blocked(x: f64, z: f64, margin: f64) -> u32 {
    u32::from(world().point_blocked(x, z, margin))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wall() -> CollisionWorld {
        let mut w = CollisionWorld::new();
        w.add_box(Aabb { min_x: 10.0, max_x: 20.0, min_z: -5.0, max_z: 5.0, min_y: -10.0, max_y: 30.0 });
        w
    }

    #[test]
    fn circle_is_pushed_out() {
        let mut w = wall();
        let c = w.resolve_circle(9.5, 0.0, 1.0, 0.0);
        assert!(c.hit);
        assert!((c.x - 9.0).abs() < 1e-9 && c.nx == -1.0);
        assert!(!w.resolve_circle(0.0, 0.0, 1.0, 0.0).hit);
    }

    #[test]
    fn rays_hit_and_miss() {
        let mut w = wall();
        assert!((w.raycast([0.0, 1.0, 0.0], [1.0, 0.0, 0.0], 100.0) - 10.0).abs() < 1e-9);
        assert_eq!(w.raycast([0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], 100.0), f64::INFINITY);
        assert_eq!(w.raycast([0.0, 1.0, 0.0], [1.0, 0.0, 0.0], 5.0), f64::INFINITY);
        // Diagonal across several cells.
        let s = std::f64::consts::FRAC_1_SQRT_2;
        assert!(w.raycast([-40.0, 1.0, -50.0], [s, 0.0, s], 200.0).is_finite());
        assert!(w.point_blocked(15.0, 0.0, 0.0));
    }
}
